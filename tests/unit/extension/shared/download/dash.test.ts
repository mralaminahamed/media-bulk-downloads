import { readFileSync } from 'fs';
import { join } from 'path';
import * as MP4Box from 'mp4box';
import * as mux from '@/extension/shared/download/stream/mux';
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
  DashError,
} from '@/extension/shared/download/stream/dash';

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
  it('drops an identifier whose value is undefined (empty substitution)', () => {
    // The token is well-formed but the var map has no value → it collapses to '',
    // rather than being left in the URL as a literal `$Time$`.
    expect(substituteTemplate('seg-$Time$.m4s', {})).toBe('seg-.m4s');
    expect(substituteTemplate('$RepresentationID$/$Number$', { Number: 3 })).toBe('/3');
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

  it('preserves startNumber="0" (a legitimate 0, not coerced to 1)', () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT6S">
  <Period><AdaptationSet mimeType="video/mp4">
    <Representation id="v" bandwidth="1" width="640" height="360">
      <SegmentTemplate initialization="i.m4v" media="s$Number$.m4v" startNumber="0" timescale="1" duration="6"/>
    </Representation>
  </AdaptationSet></Period>
</MPD>`;
    expect(parseMpd(mpd, 'https://cdn.test/m.mpd').video[0].template.startNumber).toBe(0);
  });

  it('uses Period 0 duration (not the whole presentation) for a multi-period MPD', () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period duration="PT10S"><AdaptationSet mimeType="video/mp4">
    <Representation id="v" bandwidth="1" width="640" height="360">
      <SegmentTemplate initialization="i.m4v" media="s$Number$.m4v" startNumber="1" timescale="1" duration="6"/>
    </Representation>
  </AdaptationSet></Period>
  <Period start="PT10S"><AdaptationSet mimeType="video/mp4">
    <Representation id="v2" bandwidth="1"><SegmentTemplate media="x$Number$.m4v" duration="6"/></Representation>
  </AdaptationSet></Period>
</MPD>`;
    const m = parseMpd(mpd, 'https://cdn.test/m.mpd');
    expect(m.durationSec).toBe(10); // Period 0's duration, not the 60s presentation
    expect(m.video).toHaveLength(1); // only Period 0 captured (documented limit)
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

  it('falls back to the raw base when a BaseURL cannot be resolved (unparseable base)', () => {
    // An MPD-level relative <BaseURL> against a non-absolute base makes `new URL`
    // throw inside resolveBase; it must swallow it and keep the base unchanged.
    const based = VOD_MPD.replace('<Period>', '<BaseURL>video/</BaseURL><Period>');
    const m = parseMpd(based, 'not-an-absolute-url');
    expect(m.video[0].baseUrl).toBe('not-an-absolute-url');
  });

  it('skips a Representation whose type is neither video nor audio', () => {
    // A text/subtitle AdaptationSet classifies to null and is dropped entirely.
    const withText = VOD_MPD.replace(
      '<AdaptationSet mimeType="audio/mp4">',
      `<AdaptationSet mimeType="application/mp4" contentType="text">
      <Representation id="t0" bandwidth="1000">
        <SegmentTemplate initialization="t_init.mp4" media="t_seg$Number$.mp4" startNumber="1" timescale="1" duration="6"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">`,
    );
    const m = parseMpd(withText, 'https://cdn.test/manifest.mpd');
    expect(m.video).toHaveLength(1);
    expect(m.audio).toHaveLength(1);
    expect([...m.video, ...m.audio].some((r) => r.id === 't0')).toBe(false);
  });

  it('parses a SegmentTimeline (S t/d/r) off a SegmentTemplate', () => {
    const timelined = VOD_MPD.replace(
      '<SegmentTemplate initialization="v_init.m4v" media="v_seg$Number$.m4v" startNumber="1" timescale="1" duration="6"/>',
      `<SegmentTemplate initialization="v_init.m4v" media="v_seg$Number$.m4v" startNumber="1" timescale="1000">
        <SegmentTimeline>
          <S t="0" d="1000" r="2"/>
          <S d="500"/>
        </SegmentTimeline>
      </SegmentTemplate>`,
    );
    const m = parseMpd(timelined, 'https://cdn.test/manifest.mpd');
    expect(m.video[0].template.timeline).toEqual([
      { t: 0, d: 1000, r: 2 },
      { t: undefined, d: 500, r: 0 },
    ]);
  });

  it('parses a SegmentTimeline S with a missing d attribute as 0', () => {
    // An <S> with only t → d/r default to 0 (Number(null)||0), not NaN.
    const tl = VOD_MPD.replace(
      '<SegmentTemplate initialization="v_init.m4v" media="v_seg$Number$.m4v" startNumber="1" timescale="1" duration="6"/>',
      `<SegmentTemplate media="v_seg$Number$.m4v" timescale="1000">
        <SegmentTimeline><S t="0"/></SegmentTimeline>
      </SegmentTemplate>`,
    );
    expect(parseMpd(tl, 'https://cdn.test/manifest.mpd').video[0].template.timeline).toEqual([{ t: 0, d: 0, r: 0 }]);
  });

  it('throws unsupported for a non-MPD root element', () => {
    try {
      parseMpd('<NotMPD/>', 'https://cdn.test/m.mpd');
      throw new Error('expected parseMpd to throw');
    } catch (e) {
      expect((e as DashError).code).toBe('unsupported');
      expect((e as DashError).message).toMatch(/not an mpd/i);
    }
  });

  it('throws unsupported for XML that does not parse (DOMParser error document)', () => {
    // jsdom yields a <parsererror> root, whose localName is not "MPD".
    expect(() => parseMpd('<<<not xml at all', 'https://cdn.test/m.mpd')).toThrow(/unsupported|not an mpd/i);
  });

  it('leaves durationSec 0 when neither the MPD nor the Period declares a duration', () => {
    // No mediaPresentationDuration and no Period@duration → duration stays 0.
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period><AdaptationSet mimeType="video/mp4"><Representation id="v" bandwidth="1">
    <SegmentTemplate media="s$Number$.m4s" duration="6" timescale="1"/>
  </Representation></AdaptationSet></Period>
</MPD>`;
    expect(parseMpd(xml, 'https://cdn.test/m.mpd').durationSec).toBe(0);
  });

  it('returns empty tracks (keeping duration) when the MPD has no Period', () => {
    const m = parseMpd(
      '<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT5S"></MPD>',
      'https://cdn.test/m.mpd',
    );
    expect(m.video).toEqual([]);
    expect(m.audio).toEqual([]);
    expect(m.durationSec).toBe(5);
  });

  it('fills SegmentTemplate defaults, inherits an AdaptationSet template + codecs, and reads Period@duration', () => {
    // No @type (→ static/VOD), no mediaPresentationDuration (→ Period@duration),
    // an AdaptationSet-level <SegmentTemplate> with only @media, and a bare
    // <Representation> (no id/bandwidth/codecs/mimeType) classified by @contentType.
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT12S">
    <AdaptationSet contentType="video" codecs="avc1.42c01e">
      <SegmentTemplate media="seg-$Number$.m4s"/>
      <Representation/>
    </AdaptationSet>
  </Period>
</MPD>`;
    const m = parseMpd(xml, 'https://cdn.test/m.mpd');
    expect(m.isLive).toBe(false);
    expect(m.durationSec).toBe(12);
    expect(m.video).toHaveLength(1);
    const r = m.video[0];
    expect(r).toMatchObject({ id: '', bandwidth: 0, contentType: 'video', codecs: 'avc1.42c01e' });
    // Defaults: no initialization, startNumber 1, timescale 1, no duration/timeline.
    expect(r.template).toMatchObject({ media: 'seg-$Number$.m4s', startNumber: 1, timescale: 1 });
    expect(r.template.initialization).toBeUndefined();
    expect(r.template.duration).toBeUndefined();
    expect(r.template.timeline).toBeUndefined();
  });

  it('returns default template + undefined codecs for a Representation with no SegmentTemplate anywhere', () => {
    // Neither the Representation nor its AdaptationSet defines a SegmentTemplate,
    // and neither carries @codecs → template defaults, codecs undefined.
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT5S">
  <Period><AdaptationSet mimeType="video/mp4"><Representation id="v"/></AdaptationSet></Period>
</MPD>`;
    const m = parseMpd(xml, 'https://cdn.test/m.mpd');
    expect(m.video[0].template).toEqual({ startNumber: 1, timescale: 1 });
    expect(m.video[0].codecs).toBeUndefined();
  });

  it('reads a SegmentTemplate with initialization but no media (media left undefined)', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT5S">
  <Period><AdaptationSet mimeType="video/mp4"><Representation id="v" bandwidth="1">
    <SegmentTemplate initialization="v_init.m4s"/>
  </Representation></AdaptationSet></Period>
</MPD>`;
    const m = parseMpd(xml, 'https://cdn.test/m.mpd');
    expect(m.video[0].template.initialization).toBe('v_init.m4s');
    expect(m.video[0].template.media).toBeUndefined();
  });

  it('parses ONLY the first Period — a multi-period MPD drops later periods', () => {
    // LIMITATION (see report): captureDash reads Period[0] only, so a multi-period
    // VOD loses every representation after the first period. This test pins the
    // current behaviour so a future multi-period fix is a deliberate change.
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT12S">
  <Period id="p1"><AdaptationSet mimeType="video/mp4"><Representation id="v1" bandwidth="1"><SegmentTemplate media="a$Number$.m4s" duration="6" timescale="1"/></Representation></AdaptationSet></Period>
  <Period id="p2"><AdaptationSet mimeType="video/mp4"><Representation id="v2" bandwidth="1"><SegmentTemplate media="b$Number$.m4s" duration="6" timescale="1"/></Representation></AdaptationSet></Period>
</MPD>`;
    const m = parseMpd(xml, 'https://cdn.test/m.mpd');
    expect(m.video.map((v) => v.id)).toEqual(['v1']);
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

  it('throws unsupported when the template has media but neither duration nor timeline', () => {
    try {
      expandSegments(rep({ media: 'seg-$Number$.m4s' }), 10);
      throw new Error('expected expandSegments to throw');
    } catch (e) {
      expect((e as DashError).code).toBe('unsupported');
      expect((e as DashError).message).toMatch(/duration|SegmentTimeline/i);
    }
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

  it('timeline mode: a first S without @t starts media-time at 0 and accumulates d', () => {
    // No `t` on any S → time begins at 0 and advances by d. r=1 → 2 segs per S.
    const out = expandSegments(rep({
      media: 'seg-$Time$.m4s', timescale: 1, startNumber: 1,
      timeline: [{ d: 100, r: 1 }],
    }), 0);
    expect(out.segmentUris).toEqual(['https://cdn.test/x/seg-0.m4s', 'https://cdn.test/x/seg-100.m4s']);
  });

  it('timeline mode: an r=-1 with d=0 yields exactly one segment (no divide-by-zero fill)', () => {
    // s.r < 0 but s.d is not > 0, so the "fill to end" math is skipped and the
    // S emits a single segment rather than looping forever.
    const out = expandSegments(rep({
      media: 'seg-$Number$.m4s', timescale: 1, startNumber: 1,
      timeline: [{ t: 0, d: 0, r: -1 }],
    }), 10);
    expect(out.segmentUris).toEqual(['https://cdn.test/x/seg-1.m4s']);
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
  it('falls back to highest bandwidth for a numeric target when no rep carries a height', () => {
    // A height target with no `height` metadata to match against → highest bw wins.
    const reps = [v('a', 100), v('c', 900), v('b', 500)];
    expect(selectRepresentation(reps, 720)?.id).toBe('c');
  });
  it('resolves ties on target height toward the higher bandwidth', () => {
    const reps = [v('lo', 100, 480), v('hi', 900, 480)];
    expect(selectRepresentation(reps, 480)?.id).toBe('hi');
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

  it('maps a non-DashError fetch failure to fetch-failed', async () => {
    const videoOnly = VOD_MPD.replace(/<AdaptationSet mimeType="audio\/mp4">[\s\S]*?<\/AdaptationSet>/, '');
    const failing: DashDeps = {
      fetchText: async () => videoOnly,
      fetchBytes: async () => { throw new Error('boom'); },
    };
    await expect(captureDash('https://cdn.test/manifest.mpd', failing)).rejects.toMatchObject({ code: 'fetch-failed' });
  });

  it('maps an undecodable mux to unsupported', async () => {
    // Non-empty garbage passes the init/empty guards but mp4box cannot demux it,
    // so muxTracks throws and captureDash reports `unsupported`.
    const videoOnly = VOD_MPD.replace(/<AdaptationSet mimeType="audio\/mp4">[\s\S]*?<\/AdaptationSet>/, '');
    const garbage: DashDeps = {
      fetchText: async () => videoOnly,
      fetchBytes: async () => new Uint8Array([1, 2, 3, 4]),
    };
    // mp4box logs its own BoxParser/ISOFile parse failure to console.error while
    // rejecting the undecodable bytes — expected on this path (we assert the
    // rejection), so mute it to keep the test output clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(captureDash('https://cdn.test/manifest.mpd', garbage)).rejects.toMatchObject({ code: 'unsupported' });
    } finally {
      errSpy.mockRestore();
    }
  });

  it('refuses segments a BaseURL aims at an internal host, without fetching them (SSRF guard)', async () => {
    const fetched: string[] = [];
    // An MPD-level absolute <BaseURL> relocates every segment/init URL to a
    // link-local host — the classic SSRF target. The guard must block the fetch.
    const internal = VOD_MPD.replace('<Period>', '<BaseURL>http://169.254.169.254/</BaseURL><Period>');
    const d: DashDeps = {
      fetchText: async () => internal,
      fetchBytes: async (u: string) => { fetched.push(u); return fx(u.split('/').pop()!); },
    };
    await expect(captureDash('https://cdn.test/manifest.mpd', d)).rejects.toBeInstanceOf(DashError);
    expect(fetched.some((u) => u.includes('169.254.169.254'))).toBe(false);
  });

  it('rejects unsupported when the SegmentTemplate has no initialization segment', () => {
    // media+duration expand fine, but with no @initialization the video track has
    // no init segment (initUri stays ''), which fMP4 muxing requires.
    const NO_INIT_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT6S">
  <Period><AdaptationSet mimeType="video/mp4">
    <Representation id="v0" bandwidth="1000000">
      <SegmentTemplate media="v_seg$Number$.m4v" startNumber="1" timescale="1" duration="6"/>
    </Representation>
  </AdaptationSet></Period>
</MPD>`;
    return captureDash('https://cdn.test/manifest.mpd', deps(NO_INIT_MPD)).then(
      () => { throw new Error('expected captureDash to reject'); },
      (e) => {
        expect((e as DashError).code).toBe('unsupported');
        expect((e as DashError).message).toMatch(/initialization/i);
      },
    );
  });

  it('rejects empty when the muxer returns zero bytes', async () => {
    // muxTracks succeeds (no throw) but yields an empty file — the final guard.
    const spy = vi.spyOn(mux, 'muxTracks').mockReturnValueOnce(new Uint8Array(0));
    try {
      const videoOnly = VOD_MPD.replace(/<AdaptationSet mimeType="audio\/mp4">[\s\S]*?<\/AdaptationSet>/, '');
      await expect(captureDash('https://cdn.test/manifest.mpd', deps(videoOnly))).rejects.toMatchObject({
        code: 'empty',
      });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
