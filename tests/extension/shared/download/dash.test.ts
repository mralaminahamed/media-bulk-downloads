import { readFileSync } from 'fs';
import { join } from 'path';
import * as MP4Box from 'mp4box';
import {
  parseIso8601Duration,
  substituteTemplate,
  parseMpd,
  expandSegments,
  DashRepresentation,
  selectRepresentation,
  assertDownloadable,
  captureDash,
  DashDeps,
} from '@/extension/shared/download/dash';

const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../../fixtures/dash', name)));

function tracksOf(bytes: Uint8Array): { type: 'video' | 'audio' }[] {
  const file = MP4Box.createFile() as any;
  let tracks: { type: 'video' | 'audio' }[] = [];
  file.onReady = (info: { tracks: { video?: unknown }[] }) => {
    tracks = info.tracks.map((t) => ({ type: t.video ? 'video' : 'audio' }));
  };
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer & { fileStart: number };
  ab.fileStart = 0;
  file.appendBuffer(ab as any);
  file.flush();
  return tracks;
}

describe('parseIso8601Duration', () => {
  it('parses hours/minutes/seconds and fractions', () => {
    expect(parseIso8601Duration('PT10M34S')).toBe(634);
    expect(parseIso8601Duration('PT1H')).toBe(3600);
    expect(parseIso8601Duration('PT1H2M3.5S')).toBeCloseTo(3723.5, 3);
  });
  it('returns 0 for junk / empty', () => {
    expect(parseIso8601Duration('')).toBe(0);
    expect(parseIso8601Duration('nonsense')).toBe(0);
  });
});

describe('substituteTemplate', () => {
  it('substitutes each variable', () => {
    expect(substituteTemplate('init-$RepresentationID$.m4s', { RepresentationID: 'v0' })).toBe('init-v0.m4s');
    expect(substituteTemplate('seg-$Number$.m4s', { Number: 7 })).toBe('seg-7.m4s');
    expect(substituteTemplate('seg-$Time$.m4s', { Time: 12000 })).toBe('seg-12000.m4s');
    expect(substituteTemplate('b$Bandwidth$/x', { Bandwidth: 800000 })).toBe('b800000/x');
  });
  it('zero-pads $Number%0Nd$', () => {
    expect(substituteTemplate('seg-$Number%05d$.m4s', { Number: 7 })).toBe('seg-00007.m4s');
  });
  it('treats $$ as a literal $', () => {
    expect(substituteTemplate('a$$b', {})).toBe('a$b');
  });
});

const VOD_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT6S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v0" bandwidth="1000000" width="640" height="360" codecs="avc1.640028">
        <SegmentTemplate initialization="v_init.m4v" media="v_seg$Number$.m4v" startNumber="1" timescale="1" duration="6"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">
      <Representation id="a0" bandwidth="128000" codecs="mp4a.40.2">
        <SegmentTemplate initialization="a_init.m4a" media="a_seg$Number$.m4a" startNumber="1" timescale="1" duration="6"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

describe('parseMpd', () => {
  it('extracts video + audio representations and duration', () => {
    const m = parseMpd(VOD_MPD, 'https://cdn.test/manifest.mpd');
    expect(m.isLive).toBe(false);
    expect(m.hasDrm).toBe(false);
    expect(m.durationSec).toBe(6);
    expect(m.video).toHaveLength(1);
    expect(m.audio).toHaveLength(1);
    expect(m.video[0]).toMatchObject({ id: 'v0', bandwidth: 1000000, width: 640, height: 360, contentType: 'video' });
    expect(m.video[0].template).toMatchObject({ initialization: 'v_init.m4v', media: 'v_seg$Number$.m4v', startNumber: 1, timescale: 1, duration: 6 });
    expect(m.video[0].baseUrl).toBe('https://cdn.test/manifest.mpd');
    expect(m.audio[0]).toMatchObject({ id: 'a0', bandwidth: 128000, contentType: 'audio' });
  });

  it('flags a dynamic manifest as live', () => {
    const live = VOD_MPD.replace('type="static"', 'type="dynamic"');
    expect(parseMpd(live, 'https://cdn.test/m.mpd').isLive).toBe(true);
  });

  it('flags a manifest with ContentProtection as DRM', () => {
    const drm = VOD_MPD.replace('<Representation id="v0"', '<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011"/><Representation id="v0"');
    expect(parseMpd(drm, 'https://cdn.test/m.mpd').hasDrm).toBe(true);
  });

  it('resolves a Representation-level BaseURL against the MPD url', () => {
    const based = VOD_MPD.replace('<SegmentTemplate initialization="v_init.m4v"', '<BaseURL>video/</BaseURL><SegmentTemplate initialization="v_init.m4v"');
    expect(parseMpd(based, 'https://cdn.test/manifest.mpd').video[0].baseUrl).toBe('https://cdn.test/video/');
  });
});

describe('expandSegments', () => {
  const rep = (template: object): DashRepresentation => ({
    id: 'v0', bandwidth: 1, contentType: 'video',
    baseUrl: 'https://cdn.test/x/', template: { startNumber: 1, timescale: 1, ...template } as never,
  });

  it('duration mode: computes count from total and numbers from startNumber', () => {
    const out = expandSegments(rep({ initialization: 'init-$RepresentationID$.m4s', media: 'seg-$Number$.m4s', duration: 4, timescale: 1, startNumber: 1 }), 10);
    expect(out.initUri).toBe('https://cdn.test/x/init-v0.m4s');
    // ceil(10*1/4) = 3 segments, numbered 1..3
    expect(out.segmentUris).toEqual([
      'https://cdn.test/x/seg-1.m4s',
      'https://cdn.test/x/seg-2.m4s',
      'https://cdn.test/x/seg-3.m4s',
    ]);
  });

  it('duration mode: respects a non-1 startNumber', () => {
    const out = expandSegments(rep({ media: 'seg-$Number$.m4s', duration: 5, timescale: 1, startNumber: 10 }), 5);
    expect(out.segmentUris).toEqual(['https://cdn.test/x/seg-10.m4s']);
  });

  it('timeline mode: expands S@r repeats and substitutes $Time$', () => {
    const out = expandSegments(rep({
      media: 'seg-$Time$.m4s', timescale: 1, startNumber: 1,
      timeline: [{ t: 0, d: 100, r: 2 }], // 3 segments at times 0,100,200
    }), 0);
    expect(out.segmentUris).toEqual([
      'https://cdn.test/x/seg-0.m4s',
      'https://cdn.test/x/seg-100.m4s',
      'https://cdn.test/x/seg-200.m4s',
    ]);
  });

  it('throws unsupported when there is no media template', () => {
    expect(() => expandSegments(rep({ initialization: 'i.m4s' }), 10)).toThrow(/unsupported|SegmentList|SegmentBase/i);
  });

  it('duration mode: $Time$ is the 0-based media offset, independent of startNumber', () => {
    // count = ceil(10*1/5) = 2; times must be 0 and 5 even though startNumber is 10.
    const out = expandSegments(rep({ media: 'seg-$Time$.m4s', duration: 5, timescale: 1, startNumber: 10 }), 10);
    expect(out.segmentUris).toEqual(['https://cdn.test/x/seg-0.m4s', 'https://cdn.test/x/seg-5.m4s']);
  });

  it('timeline mode: S@r=-1 repeats to the end of the period duration', () => {
    // 250s at d=100 → segments at t=0,100,200 (3 segments), numbered 1..3.
    const out = expandSegments(rep({
      media: 'seg-$Number$.m4s', timescale: 1, startNumber: 1,
      timeline: [{ t: 0, d: 100, r: -1 }],
    }), 250);
    expect(out.segmentUris).toEqual([
      'https://cdn.test/x/seg-1.m4s',
      'https://cdn.test/x/seg-2.m4s',
      'https://cdn.test/x/seg-3.m4s',
    ]);
  });
});

describe('selectRepresentation', () => {
  const v = (id: string, bandwidth: number, height?: number): DashRepresentation => ({
    id, bandwidth, height, contentType: 'video', baseUrl: 'https://x/', template: { startNumber: 1, timescale: 1 },
  });
  it('picks highest bandwidth by default, lowest on request', () => {
    const reps = [v('a', 100), v('c', 900), v('b', 500)];
    expect(selectRepresentation(reps)?.id).toBe('c');
    expect(selectRepresentation(reps, 'lowest')?.id).toBe('a');
  });
  it('picks the representation closest to a target height', () => {
    const reps = [v('a', 100, 360), v('b', 900, 1080), v('c', 500, 720)];
    expect(selectRepresentation(reps, 720)?.id).toBe('c');
  });
  it('returns undefined for an empty list', () => {
    expect(selectRepresentation([])).toBeUndefined();
  });
});

describe('assertDownloadable', () => {
  const base = { isLive: false, hasDrm: false, durationSec: 6, audio: [] as never[] };
  const withVideo = [{ id: 'v', bandwidth: 1, contentType: 'video', baseUrl: 'https://x/', template: { startNumber: 1, timescale: 1 } }] as never;
  it('refuses a live manifest', () => {
    expect(() => assertDownloadable({ ...base, isLive: true, video: withVideo })).toThrow(/live/i);
  });
  it('refuses a DRM manifest', () => {
    expect(() => assertDownloadable({ ...base, hasDrm: true, video: withVideo })).toThrow(/DRM/i);
  });
  it('refuses a manifest with no video representation', () => {
    expect(() => assertDownloadable({ ...base, video: [] as never })).toThrow(/no video|representation/i);
  });
  it('accepts a clear VOD manifest with video', () => {
    expect(() => assertDownloadable({ ...base, video: withVideo })).not.toThrow();
  });
});

describe('captureDash — e2e mux', () => {
  const deps = (mpd = VOD_MPD): DashDeps => ({
    fetchText: async () => mpd,
    fetchBytes: async (u: string) => fx(u.split('/').pop()!),
  });

  it('parses, expands, fetches, and muxes video + audio into one MP4', async () => {
    const res = await captureDash('https://cdn.test/manifest.mpd', deps());
    expect(res.ext).toBe('mp4');
    expect(res.muxedAudio).toBe(true);
    expect(String.fromCharCode(res.bytes[4], res.bytes[5], res.bytes[6], res.bytes[7])).toBe('ftyp');
    const tracks = tracksOf(res.bytes);
    expect(tracks).toHaveLength(2);
    expect(tracks.some((t) => t.type === 'video')).toBe(true);
    expect(tracks.some((t) => t.type === 'audio')).toBe(true);
  });

  it('produces a video-only MP4 when the manifest has no audio AdaptationSet', async () => {
    const videoOnly = VOD_MPD.replace(/<AdaptationSet mimeType="audio\/mp4">[\s\S]*?<\/AdaptationSet>/, '');
    const res = await captureDash('https://cdn.test/manifest.mpd', deps(videoOnly));
    expect(res.muxedAudio).toBe(false);
    expect(tracksOf(res.bytes)).toHaveLength(1);
  });

  it('throws too-large when the summed bytes exceed maxBytes', async () => {
    // v_seg1.m4v is ~90 KB; 1000 bytes forces the video track over budget.
    await expect(captureDash('https://cdn.test/manifest.mpd', deps(), { maxBytes: 1000 })).rejects.toMatchObject({
      code: 'too-large',
    });
  });
});
