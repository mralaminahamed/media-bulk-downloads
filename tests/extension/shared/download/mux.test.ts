import { readFileSync } from 'fs';
import { join } from 'path';
import * as MP4Box from 'mp4box';
import { muxTracks } from '@/extension/shared/download/mux';

// Real fragmented-MP4 tracks (Big Buck Bunny, lowest rendition): a demuxed
// video-only .m4v and audio-only .m4a init + one segment each. Muxing these is
// exactly the DASH/demuxed-HLS case.
const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../../fixtures/dash', name)));
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
