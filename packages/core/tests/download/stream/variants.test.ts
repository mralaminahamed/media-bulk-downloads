import { describe, it, expect } from 'vitest';
import { variantsFromMaster, variantsFromMpd, formatVariantLabel } from '@mbd/core/download/stream/variants';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=246440,RESOLUTION=320x184,CODECS="mp4a.40.5,avc1.42000d",NAME="240"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6221600,RESOLUTION=1920x1080,CODECS="avc1.640028",NAME="1080"
high/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=836280,RESOLUTION=848x480,NAME="480"
mid/index.m3u8
`;

const SINGLE_MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6221600,RESOLUTION=1920x1080
high/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:6.0,
seg0.ts
`;

const SAME_HEIGHT = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
a/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
b/index.m3u8
`;

const MIXED = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
hi/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=128000
audio/index.m3u8
`;

const MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT6S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v0" bandwidth="5000000" width="1920" height="1080" codecs="avc1.640028">
        <SegmentTemplate initialization="v0_init.m4v" media="v0_$Number$.m4v" startNumber="1" timescale="1" duration="6"/>
      </Representation>
      <Representation id="v1" bandwidth="2500000" width="1280" height="720" codecs="avc1.4d401f">
        <SegmentTemplate initialization="v1_init.m4v" media="v1_$Number$.m4v" startNumber="1" timescale="1" duration="6"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">
      <Representation id="a0" bandwidth="128000" codecs="mp4a.40.2">
        <SegmentTemplate initialization="a_init.m4a" media="a_$Number$.m4a" startNumber="1" timescale="1" duration="6"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

describe('variantsFromMaster', () => {
  it('returns one entry per height, sorted height-desc, with labels', () => {
    const vs = variantsFromMaster(MASTER, 'https://cdn.test/master.m3u8');
    expect(vs.map((v) => v.height)).toEqual([1080, 480, 184]);
    expect(vs[0]).toMatchObject({ height: 1080, bandwidth: 6221600 });
    expect(vs[0].label).toContain('1080p');
  });

  it('returns a single entry for a single-rendition master', () => {
    expect(variantsFromMaster(SINGLE_MASTER, 'https://cdn.test/m.m3u8')).toHaveLength(1);
  });

  it('returns [] for a bare (non-master) media playlist', () => {
    expect(variantsFromMaster(MEDIA, 'https://cdn.test/m.m3u8')).toEqual([]);
  });

  it('collapses same-height renditions to one, keeping the higher bandwidth', () => {
    const vs = variantsFromMaster(SAME_HEIGHT, 'https://cdn.test/m.m3u8');
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ height: 1080, bandwidth: 6000000 });
  });

  it('drops a height-less rendition mixed with a height-bearing one', () => {
    const vs = variantsFromMaster(MIXED, 'https://cdn.test/m.m3u8');
    expect(vs).toHaveLength(1);
    expect(vs[0].height).toBe(1080);
  });
});

describe('variantsFromMpd', () => {
  it('returns video reps as height-desc variants, excluding audio', () => {
    const vs = variantsFromMpd(MPD, 'https://cdn.test/manifest.mpd');
    expect(vs.map((v) => v.height)).toEqual([1080, 720]);
    expect(vs.map((v) => v.bandwidth)).toEqual([5000000, 2500000]);
  });
});

describe('formatVariantLabel', () => {
  it('renders height + Mbps for multi-Mbps streams', () => {
    expect(formatVariantLabel(1080, 5_200_000)).toBe('1080p · 5.2 Mbps');
  });
  it('drops the height when absent and uses kbps under 1 Mbps', () => {
    expect(formatVariantLabel(undefined, 800_000)).toBe('800 kbps');
  });
});
