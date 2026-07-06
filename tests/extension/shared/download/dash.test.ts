import { parseIso8601Duration, substituteTemplate, parseMpd, expandSegments, DashRepresentation } from '@/extension/shared/download/dash';

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
});
