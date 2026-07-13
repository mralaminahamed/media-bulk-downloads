import { readFileSync } from 'fs';
import { join } from 'path';
import * as MP4Box from 'mp4box';
import { muxTracks } from '@mbd/core/download/stream/mux';

// mp4box is a CJS module whose ESM namespace is frozen under Vite (can't assign
// `createFile`). Mock it so `createFile` is a swappable spy that DELEGATES to the
// real implementation by default — real parsing (tracksOf, the main describe)
// keeps working; only the fallback tests override it per-case.
vi.mock('mp4box', async () => {
  const actual = await vi.importActual<typeof import('mp4box')>('mp4box');
  return { ...actual, createFile: vi.fn(actual.createFile) };
});

// Real fragmented-MP4 tracks (Big Buck Bunny, lowest rendition): a demuxed
// video-only .m4v and audio-only .m4a init + one segment each. Muxing these is
// exactly the DASH/demuxed-HLS case.
const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/dash', name)));
const VIDEO = { init: fx('v_init.m4v'), segments: [fx('v_seg1.m4v')] };
const AUDIO = { init: fx('a_init.m4a'), segments: [fx('a_seg1.m4a')] };

/** Parse an MP4's tracks back out with mp4box to assert what muxTracks produced. */
function tracksOf(bytes: Uint8Array): { codec: string; type: 'video' | 'audio' }[] {
  const file = MP4Box.createFile() as any;
  let tracks: { codec: string; type: 'video' | 'audio' }[] = [];
  file.onReady = (info: { tracks: { codec: string; video?: unknown; audio?: unknown }[] }) => {
    tracks = info.tracks.map((t) => ({ codec: t.codec, type: t.video ? 'video' : 'audio' }));
  };
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer & { fileStart: number };
  ab.fileStart = 0;
  file.appendBuffer(ab as any);
  file.flush();
  return tracks;
}

describe('muxTracks', () => {
  it('combines demuxed video + audio into one MP4 with both tracks', () => {
    const out = muxTracks(VIDEO, AUDIO);
    // valid ISO-BMFF: starts with an ftyp box
    expect(String.fromCharCode(out[4], out[5], out[6], out[7])).toBe('ftyp');
    const tracks = tracksOf(out);
    expect(tracks).toHaveLength(2);
    expect(tracks.find((t) => t.type === 'video')?.codec).toMatch(/^avc1/);
    expect(tracks.find((t) => t.type === 'audio')?.codec).toMatch(/^mp4a/);
  });

  it('produces a valid video-only MP4 when no audio track is given', () => {
    const out = muxTracks(VIDEO);
    const tracks = tracksOf(out);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ type: 'video' });
  });

  it('throws when a track has no decodable samples', () => {
    expect(() => muxTracks({ init: VIDEO.init, segments: [] })).toThrow(/no decodable samples/);
  });
});

/**
 * Defensive fallbacks that real avc1 fixtures never trigger: a sample-description
 * entry with no width/height (dimensions must come from the track header) and a
 * getBuffer() result exposing only `.buffer` (length must come from its
 * byteLength). Faked via a minimal mp4box stand-in, real mp4box restored after.
 */
describe('muxTracks — dimension + buffer fallbacks', () => {
  // Swap the mocked createFile spy per-test, restoring the real delegate after.
  let realCreateFile: typeof MP4Box.createFile;
  beforeAll(async () => {
    realCreateFile = (await vi.importActual<typeof import('mp4box')>('mp4box')).createFile;
    vi.mocked(MP4Box.createFile).mockImplementation(realCreateFile);
  });
  afterEach(() => { vi.mocked(MP4Box.createFile).mockImplementation(realCreateFile); });

  // A minimal mp4box stand-in whose onReady delivers `info`, whose stsd entry is
  // `entry`, and whose getBuffer exposes only `.buffer` (no byteLength/position).
  const fakeFileFactory = (info: Record<string, unknown>, entry: Record<string, unknown>) => (): unknown => {
    const self: Record<string, unknown> = {
      onReady: null,
      onSamples: null,
      _ready: false,
      setExtractionOptions: () => undefined,
      start() {
        (self.onSamples as ((id: number, u: unknown, s: unknown[]) => void) | null)?.(info.id as number, null, [
          { data: new Uint8Array([0]), duration: 10, dts: 0, cts: 0, is_sync: true },
        ]);
      },
      appendBuffer: () => undefined,
      flush() {
        if (self.onReady && !self._ready) {
          self._ready = true;
          (self.onReady as (i: unknown) => void)({ tracks: [info] });
        }
      },
      getTrackById: () => ({ mdia: { minf: { stbl: { stsd: { entries: [entry] } } } } }),
      addTrack: () => 2,
      addSample: () => undefined,
      getBuffer: () => ({ buffer: new ArrayBuffer(10) }), // no byteLength / position
    };
    return self;
  };

  it('takes track_width/height and buffer.byteLength when the entry + DataStream omit them', () => {
    // entry.width falsy AND info.video falsy → dimensions come from track_width/height.
    const info = { id: 1, timescale: 600, track_width: 320, track_height: 240 };
    const entry = { type: 'avc1', boxes: [] };
    vi.mocked(MP4Box.createFile).mockImplementation(fakeFileFactory(info, entry) as unknown as typeof MP4Box.createFile);

    const out = muxTracks({ init: new Uint8Array([1]), segments: [new Uint8Array([2])] });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(10); // length resolved from ds.buffer.byteLength
  });

  it('takes info.video.width/height when the entry omits them but the track info carries video', () => {
    // entry.width falsy but info.video present → the middle `||` branch is used.
    const info = { id: 1, timescale: 600, video: { width: 128, height: 96 } };
    const entry = { type: 'avc1', boxes: [] };
    vi.mocked(MP4Box.createFile).mockImplementation(fakeFileFactory(info, entry) as unknown as typeof MP4Box.createFile);

    const out = muxTracks({ init: new Uint8Array([1]), segments: [new Uint8Array([2])] });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(10);
  });
});
