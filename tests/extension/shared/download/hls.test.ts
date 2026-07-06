import {
  captureHls,
  assertDownloadable,
  HlsError,
  HlsDeps,
  isMasterPlaylist,
  ivFromSequence,
  parseMaster,
  parseMediaPlaylist,
  selectVariant,
} from '@/extension/shared/download/hls';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=246440,RESOLUTION=320x184,CODECS="mp4a.40.5,avc1.42000d",NAME="240"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6221600,RESOLUTION=1920x1080,CODECS="avc1.640028",NAME="1080"
high/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=836280,RESOLUTION=848x480,NAME="480"
mid/index.m3u8
`;

const MEDIA_TS = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.000,
seg0.ts
#EXTINF:9.500,
seg1.ts
#EXT-X-ENDLIST
`;

const bytesOf = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
const strOf = (b: Uint8Array) => Buffer.from(b).toString('utf8');

/** Deps that serve canned text and echo a synthetic body per segment URL. */
function fakeDeps(overrides: Partial<HlsDeps> = {}, texts: Record<string, string> = {}): HlsDeps {
  return {
    fetchText: async (u) => {
      const key = Object.keys(texts).find((k) => u.endsWith(k));
      if (key) return texts[key];
      throw new Error(`no canned text for ${u}`);
    },
    fetchBytes: async (u) => bytesOf(`BODY:${u.split('/').pop()}`),
    decrypt: async (_k, _iv, data) => data, // identity by default (clear content)
    ...overrides,
  };
}

describe('isMasterPlaylist / parseMaster / selectVariant', () => {
  it('detects a master vs a media playlist', () => {
    expect(isMasterPlaylist(MASTER)).toBe(true);
    expect(isMasterPlaylist(MEDIA_TS)).toBe(false);
  });

  it('parses variants with absolute URIs, bandwidth and resolution', () => {
    const vs = parseMaster(MASTER, 'https://cdn.test/path/master.m3u8');
    expect(vs).toHaveLength(3);
    expect(vs[1]).toMatchObject({
      uri: 'https://cdn.test/path/high/index.m3u8',
      bandwidth: 6221600,
      resolution: { width: 1920, height: 1080 },
      name: '1080',
    });
  });

  it('selects highest bandwidth by default, lowest on request', () => {
    const vs = parseMaster(MASTER, 'https://cdn.test/m.m3u8');
    expect(selectVariant(vs).bandwidth).toBe(6221600);
    expect(selectVariant(vs, 'lowest').bandwidth).toBe(246440);
  });

  it('selects the variant closest to a target height', () => {
    const vs = parseMaster(MASTER, 'https://cdn.test/m.m3u8');
    expect(selectVariant(vs, 480).resolution!.height).toBe(480);
    expect(selectVariant(vs, 300).resolution!.height).toBe(184); // 184 closer to 300 than 480
  });

  it('throws no-variants for an empty master', () => {
    expect(() => selectVariant([])).toThrow(HlsError);
  });
});

describe('parseMediaPlaylist', () => {
  it('parses segments, durations, VOD flag, and absolute URIs', () => {
    const pl = parseMediaPlaylist(MEDIA_TS, 'https://cdn.test/v/index.m3u8');
    expect(pl.isLive).toBe(false);
    expect(pl.segments.map((s) => s.uri)).toEqual([
      'https://cdn.test/v/seg0.ts',
      'https://cdn.test/v/seg1.ts',
    ]);
    expect(pl.segments[0]).toMatchObject({ duration: 10, seq: 0 });
    expect(pl.totalDuration).toBeCloseTo(19.5);
  });

  it('marks a playlist with no EXT-X-ENDLIST as live', () => {
    const live = MEDIA_TS.replace('#EXT-X-ENDLIST\n', '');
    expect(parseMediaPlaylist(live, 'https://cdn.test/v/i.m3u8').isLive).toBe(true);
  });

  it('carries an EXT-X-KEY forward to every following segment and resolves its URI', () => {
    const enc = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:1
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
#EXTINF:6,
a.ts
#EXTINF:6,
b.ts
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(enc, 'https://cdn.test/s/i.m3u8');
    expect(pl.segments[0].seq).toBe(1);
    expect(pl.segments[1].key).toMatchObject({ method: 'AES-128', uri: 'https://cdn.test/s/enc.key' });
  });

  it('reads an fMP4 EXT-X-MAP init segment', () => {
    const fmp4 = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4,
0.m4s
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(fmp4, 'https://cdn.test/f/i.m3u8');
    expect(pl.initUri).toBe('https://cdn.test/f/init.mp4');
  });

  it('parses EXT-X-BYTERANGE with an implicit offset chaining the previous range', () => {
    const br = `#EXTM3U
#EXTINF:4,
#EXT-X-BYTERANGE:100@0
media.ts
#EXTINF:4,
#EXT-X-BYTERANGE:200
media.ts
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(br, 'https://cdn.test/b/i.m3u8');
    expect(pl.segments[0].byteRange).toEqual({ length: 100, offset: 0 });
    expect(pl.segments[1].byteRange).toEqual({ length: 200, offset: 100 });
  });
});

describe('ivFromSequence', () => {
  it('is the 16-byte big-endian sequence number', () => {
    expect(Array.from(ivFromSequence(1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(Array.from(ivFromSequence(0x01020304)).slice(12)).toEqual([1, 2, 3, 4]);
  });
});

describe('assertDownloadable — policy guards', () => {
  const seg = (key?: object) => ({ uri: 'x', duration: 1, seq: 0, key } as never);
  const pl = (extra: object) => ({ segments: [seg()], isLive: false, targetDuration: 1, totalDuration: 1, ...extra } as never);

  it('refuses a live stream', () => {
    expect(() => assertDownloadable(pl({ isLive: true }))).toThrow(/live stream/i);
  });
  it('refuses an empty playlist', () => {
    expect(() => assertDownloadable(pl({ segments: [] }))).toThrow(HlsError);
  });
  it('refuses DRM keyformats', () => {
    const drm = { segments: [seg({ method: 'AES-128', keyformat: 'com.widevine.alpha' })], isLive: false } as never;
    expect(() => assertDownloadable(drm)).toThrow(/DRM/i);
  });
  it('refuses SAMPLE-AES', () => {
    const s = { segments: [seg({ method: 'SAMPLE-AES' })], isLive: false } as never;
    expect(() => assertDownloadable(s)).toThrow(/SAMPLE-AES/i);
  });
  it('accepts plain AES-128 and clear content', () => {
    expect(() => assertDownloadable(pl({}))).not.toThrow();
    const aes = { segments: [seg({ method: 'AES-128', uri: 'k' })], isLive: false } as never;
    expect(() => assertDownloadable(aes)).not.toThrow();
  });
});

describe('captureHls — orchestration', () => {
  it('resolves a master, picks the highest variant, assembles segments in order', async () => {
    const deps = fakeDeps({}, { 'master.m3u8': MASTER, 'high/index.m3u8': MEDIA_TS });
    const res = await captureHls('https://cdn.test/master.m3u8', deps);
    expect(res.ext).toBe('ts');
    expect(res.mime).toBe('video/mp2t');
    expect(res.segmentCount).toBe(2);
    expect(res.variant?.bandwidth).toBe(6221600);
    // ordered concat of the two synthetic segment bodies
    expect(strOf(res.bytes)).toBe('BODY:seg0.tsBODY:seg1.ts');
  });

  it('handles a bare media playlist (no master) without re-fetching', async () => {
    let textCalls = 0;
    const deps = fakeDeps(
      { fetchText: async () => { textCalls++; return MEDIA_TS; } },
    );
    const res = await captureHls('https://cdn.test/v/index.m3u8', deps);
    expect(textCalls).toBe(1); // media playlist fetched once, not twice
    expect(res.segmentCount).toBe(2);
  });

  it('prefixes the fMP4 init segment, yielding an .mp4', async () => {
    const fmp4 = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4,
0.m4s
#EXT-X-ENDLIST`;
    const deps = fakeDeps({}, { 'index.m3u8': fmp4 });
    const res = await captureHls('https://cdn.test/f/index.m3u8', deps);
    expect(res.ext).toBe('mp4');
    expect(strOf(res.bytes)).toBe('BODY:init.mp4BODY:0.m4s');
  });

  it('fetches the AES-128 key once and decrypts each segment', async () => {
    const enc = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
#EXTINF:6,
a.ts
#EXTINF:6,
b.ts
#EXT-X-ENDLIST`;
    let keyFetches = 0;
    const decryptCalls: string[] = [];
    const deps = fakeDeps(
      {
        fetchBytes: async (u) => {
          if (u.endsWith('enc.key')) { keyFetches++; return new Uint8Array(16); }
          return bytesOf(`ENC:${u.split('/').pop()}`);
        },
        decrypt: async (key, _iv, data) => {
          expect(key.length).toBe(16);
          decryptCalls.push(strOf(data));
          return bytesOf(strOf(data).replace('ENC', 'DEC'));
        },
      },
      { 'index.m3u8': enc },
    );
    const res = await captureHls('https://cdn.test/s/index.m3u8', deps);
    expect(keyFetches).toBe(1); // cached across both segments
    expect(decryptCalls.sort()).toEqual(['ENC:a.ts', 'ENC:b.ts']);
    expect(strOf(res.bytes)).toBe('DEC:a.tsDEC:b.ts');
  });

  it('reports progress per segment', async () => {
    const seen: Array<[number, number]> = [];
    const deps = fakeDeps({ onProgress: (d, t) => seen.push([d, t]) }, { 'index.m3u8': MEDIA_TS });
    await captureHls('https://cdn.test/v/index.m3u8', deps);
    expect(seen.map((s) => s[0]).sort()).toEqual([1, 2]);
    expect(seen.every((s) => s[1] === 2)).toBe(true);
  });

  it('throws too-large once the running size exceeds maxBytes', async () => {
    const deps = fakeDeps({ fetchBytes: async () => new Uint8Array(1000) }, { 'index.m3u8': MEDIA_TS });
    await expect(captureHls('https://cdn.test/v/index.m3u8', deps, { maxBytes: 1500 })).rejects.toMatchObject({
      code: 'too-large',
    });
  });

  it('refuses a live stream before downloading anything', async () => {
    const live = MEDIA_TS.replace('#EXT-X-ENDLIST\n', '');
    let fetched = 0;
    const deps = fakeDeps(
      { fetchBytes: async (u) => { fetched++; return bytesOf(u); } },
      { 'index.m3u8': live },
    );
    await expect(captureHls('https://cdn.test/v/index.m3u8', deps)).rejects.toMatchObject({ code: 'live' });
    expect(fetched).toBe(0);
  });
});
