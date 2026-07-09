import { readFileSync } from 'fs';
import { join } from 'path';
import * as MP4Box from 'mp4box';
import * as mux from '@/extension/shared/download/stream/mux';
import {
  captureHls,
  assertDownloadable,
  HlsError,
  HlsDeps,
  HlsVariant,
  HlsAudioRendition,
  isMasterPlaylist,
  ivFromSequence,
  parseAudioRenditions,
  parseMaster,
  parseMediaPlaylist,
  selectAudioRendition,
  selectVariant,
} from '@/extension/shared/download/stream/hls';

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

describe('captureHls — SSRF guard', () => {
  // A page-controlled manifest must not be able to drive the offscreen fetcher
  // (which holds <all_urls>) at an internal host. Each case asserts the capture
  // rejects AND the injected fetcher was never actually called with the URL.
  it('refuses a segment URL that targets the link-local metadata host, without fetching it', async () => {
    const fetched: string[] = [];
    const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.0,
http://169.254.169.254/latest/seg0.ts
#EXT-X-ENDLIST
`;
    const deps = fakeDeps(
      { fetchBytes: async (u) => { fetched.push(u); return bytesOf('x'); } },
      { 'index.m3u8': MEDIA },
    );
    await expect(captureHls('https://cdn.test/v/index.m3u8', deps)).rejects.toBeInstanceOf(HlsError);
    expect(fetched).not.toContain('http://169.254.169.254/latest/seg0.ts');
  });

  it('refuses an EXT-X-KEY URI that targets loopback, without fetching the key', async () => {
    const fetched: string[] = [];
    const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="http://127.0.0.1:9200/key.bin"
#EXTINF:6.0,
seg0.ts
#EXT-X-ENDLIST
`;
    const deps = fakeDeps(
      { fetchBytes: async (u) => { fetched.push(u); return bytesOf('x'); } },
      { 'index.m3u8': MEDIA },
    );
    await expect(captureHls('https://cdn.test/v/index.m3u8', deps)).rejects.toBeInstanceOf(HlsError);
    expect(fetched).not.toContain('http://127.0.0.1:9200/key.bin');
  });

  it('refuses a master whose selected variant points at localhost, without fetching it', async () => {
    const texts: string[] = [];
    const MASTER_INTERNAL = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000
http://localhost:8080/media.m3u8
`;
    const deps = fakeDeps({
      fetchText: async (u) => {
        texts.push(u);
        if (u.endsWith('master.m3u8')) return MASTER_INTERNAL;
        throw new Error(`no canned text for ${u}`);
      },
    });
    await expect(captureHls('https://cdn.test/master.m3u8', deps)).rejects.toThrow(/disallowed host/i);
    expect(texts).not.toContain('http://localhost:8080/media.m3u8');
  });
});

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

  it('skips comment/blank lines before a variant URI, prefers AVERAGE-BANDWIDTH, and tolerates missing attrs', () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=500000,BANDWIDTH=600000,RESOLUTION=1280x720
#a stray comment between the tag and its uri

hi.m3u8
#EXT-X-STREAM-INF:CODECS="mp4a.40.2"
noband.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=200000`;
    const vs = parseMaster(master, 'https://cdn.test/path/master.m3u8');
    // The trailing STREAM-INF has no following URI line → dropped entirely.
    expect(vs).toHaveLength(2);
    // AVERAGE-BANDWIDTH is preferred over BANDWIDTH; URI resolved past the comment/blank.
    expect(vs[0]).toMatchObject({ uri: 'https://cdn.test/path/hi.m3u8', bandwidth: 500000 });
    expect(vs[0].resolution).toEqual({ width: 1280, height: 720 });
    // No BANDWIDTH at all → 0; no RESOLUTION → undefined.
    expect(vs[1]).toMatchObject({ uri: 'https://cdn.test/path/noband.m3u8', bandwidth: 0 });
    expect(vs[1].resolution).toBeUndefined();
  });

  it('resolves a height tie toward the higher-bandwidth variant', () => {
    const vs: HlsVariant[] = [
      { uri: 'https://cdn.test/lo.m3u8', bandwidth: 100, resolution: { width: 800, height: 480 } },
      { uri: 'https://cdn.test/hi.m3u8', bandwidth: 900, resolution: { width: 850, height: 480 } },
    ];
    expect(selectVariant(vs, 480).uri).toBe('https://cdn.test/hi.m3u8');
  });

  it('falls back to highest bandwidth for a numeric target when no variant has a resolution', () => {
    const vs: HlsVariant[] = [
      { uri: 'https://cdn.test/a.m3u8', bandwidth: 100 },
      { uri: 'https://cdn.test/b.m3u8', bandwidth: 900 },
    ];
    expect(selectVariant(vs, 720).bandwidth).toBe(900);
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

  it('decodes an explicit hex IV on an EXT-X-KEY into 16 bytes', () => {
    // Exercises hexToBytes: the `0x…` prefix is stripped and each byte pair parsed.
    const enc = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x000102030405060708090A0B0C0D0E0F
#EXTINF:6,
a.ts
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(enc, 'https://cdn.test/s/i.m3u8');
    expect(Array.from(pl.segments[0].key!.iv!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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

  it('clears the carried-forward key when a later EXT-X-KEY:METHOD=NONE appears', () => {
    // Real pattern: an encrypted run followed by clear segments. NONE must wipe
    // the active key so following segments are treated as plaintext.
    const mixed = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
#EXTINF:6,
a.ts
#EXT-X-KEY:METHOD=NONE
#EXTINF:6,
b.ts
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(mixed, 'https://cdn.test/s/i.m3u8');
    expect(pl.segments[0].key).toMatchObject({ method: 'AES-128' });
    expect(pl.segments[1].key).toBeUndefined();
  });

  it('parses an EXT-X-KEY that carries no URI (uri left undefined)', () => {
    const enc = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128
#EXTINF:6,
a.ts
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(enc, 'https://cdn.test/s/i.m3u8');
    expect(pl.segments[0].key).toEqual({ method: 'AES-128', uri: undefined, iv: undefined, keyformat: undefined });
  });

  it('reads an EXT-X-MAP byte range alongside its URI', () => {
    const fmp4 = `#EXTM3U
#EXT-X-MAP:URI="init.mp4",BYTERANGE="800@0"
#EXTINF:4,
0.m4s
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(fmp4, 'https://cdn.test/f/i.m3u8');
    expect(pl.initUri).toBe('https://cdn.test/f/init.mp4');
    expect(pl.initByteRange).toEqual({ length: 800, offset: 0 });
  });

  it('reads an EXT-X-MAP byte range even when the tag omits a URI', () => {
    // Defensive: a MAP without URI still yields its byte range; initUri stays undefined.
    const fmp4 = `#EXTM3U
#EXT-X-MAP:BYTERANGE="800@0"
#EXTINF:4,
0.m4s
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(fmp4, 'https://cdn.test/f/i.m3u8');
    expect(pl.initUri).toBeUndefined();
    expect(pl.initByteRange).toEqual({ length: 800, offset: 0 });
  });

  it('treats a segment with no preceding EXTINF as duration 0', () => {
    const noExtinf = `#EXTM3U
seg0.ts
#EXT-X-ENDLIST`;
    const pl = parseMediaPlaylist(noExtinf, 'https://cdn.test/v/i.m3u8');
    expect(pl.segments).toHaveLength(1);
    expect(pl.segments[0].duration).toBe(0);
    expect(pl.totalDuration).toBe(0);
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
  it('refuses an unknown encryption method with unsupported-key', () => {
    const s = { segments: [seg({ method: 'AES-256' })], isLive: false } as never;
    expect(() => assertDownloadable(s)).toThrow(HlsError);
    try {
      assertDownloadable(s);
    } catch (e) {
      expect((e as HlsError).code).toBe('unsupported-key');
      expect((e as HlsError).message).toMatch(/AES-256/);
    }
  });
  it('refuses AES-128 with no key URI (would otherwise save encrypted garbage)', () => {
    const s = { segments: [seg({ method: 'AES-128', uri: undefined })], isLive: false } as never;
    expect(() => assertDownloadable(s)).toThrow(HlsError);
    try {
      assertDownloadable(s);
    } catch (e) {
      expect((e as HlsError).code).toBe('unsupported-key');
      expect((e as HlsError).message).toMatch(/key URI/i);
    }
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

  it('guesses .mp4 for fMP4 segments that have no EXT-X-MAP init', async () => {
    // .m4s extension with no init segment → mp4 container by suffix, not ts.
    const m4s = `#EXTM3U
#EXTINF:4,
0.m4s
#EXT-X-ENDLIST`;
    const deps = fakeDeps({}, { 'index.m3u8': m4s });
    const res = await captureHls('https://cdn.test/f/index.m3u8', deps);
    expect(res.ext).toBe('mp4');
    expect(res.mime).toBe('video/mp4');
    expect(strOf(res.bytes)).toBe('BODY:0.m4s'); // no init prefix
  });

  it('guesses .aac (audio/aac) for a raw AAC segment playlist', async () => {
    const aac = `#EXTM3U
#EXTINF:4,
0.aac
#EXT-X-ENDLIST`;
    const deps = fakeDeps({}, { 'index.m3u8': aac });
    const res = await captureHls('https://cdn.test/a/index.m3u8', deps);
    expect(res.ext).toBe('aac');
    expect(res.mime).toBe('audio/aac');
  });

  it('throws fetch-failed when the AES-128 key is not 16 bytes', async () => {
    const enc = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
#EXTINF:6,
a.ts
#EXT-X-ENDLIST`;
    const deps = fakeDeps(
      { fetchBytes: async (u) => (u.endsWith('enc.key') ? new Uint8Array(15) : bytesOf('x')) },
      { 'index.m3u8': enc },
    );
    await expect(captureHls('https://cdn.test/s/index.m3u8', deps)).rejects.toMatchObject({ code: 'fetch-failed' });
  });

  it('throws empty when every segment fetches to zero bytes (concat path)', async () => {
    const deps = fakeDeps({ fetchBytes: async () => new Uint8Array(0) }, { 'index.m3u8': MEDIA_TS });
    await expect(captureHls('https://cdn.test/v/index.m3u8', deps)).rejects.toMatchObject({ code: 'empty' });
  });
});

const MASTER_DEMUX = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="subs/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud"
video/v.m3u8
`;

describe('parseAudioRenditions', () => {
  it('parses TYPE=AUDIO rows with absolute URIs and the DEFAULT flag', () => {
    const rs = parseAudioRenditions(MASTER_DEMUX, 'https://cdn.test/path/master.m3u8');
    expect(rs).toHaveLength(1); // subtitles ignored
    expect(rs[0]).toMatchObject({
      groupId: 'aud',
      name: 'English',
      language: 'en',
      isDefault: true,
      uri: 'https://cdn.test/path/audio/en.m3u8',
    });
  });

  it('returns an empty array for a master with no audio media', () => {
    expect(parseAudioRenditions(MASTER, 'https://cdn.test/master.m3u8')).toEqual([]);
  });

  it('defaults a missing GROUP-ID to "" and a missing NAME to undefined', () => {
    const m = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,URI="a.m3u8"`;
    const rs = parseAudioRenditions(m, 'https://cdn.test/path/master.m3u8');
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ groupId: '', isDefault: false, uri: 'https://cdn.test/path/a.m3u8' });
    expect(rs[0].name).toBeUndefined();
  });
});

describe('parseMaster — audio group', () => {
  it('records the AUDIO group id on the variant', () => {
    const vs = parseMaster(MASTER_DEMUX, 'https://cdn.test/path/master.m3u8');
    expect(vs[0].audioGroup).toBe('aud');
  });

  it('leaves audioGroup undefined when the variant names no AUDIO group', () => {
    const vs = parseMaster(MASTER, 'https://cdn.test/master.m3u8');
    expect(vs[0].audioGroup).toBeUndefined();
  });
});

describe('selectAudioRendition', () => {
  const V = (audioGroup?: string): HlsVariant => ({ uri: 'https://cdn.test/v.m3u8', bandwidth: 1, audioGroup });
  const R = (groupId: string, isDefault: boolean, uri?: string): HlsAudioRendition => ({ groupId, isDefault, uri });

  it('picks the DEFAULT rendition in the variant’s group', () => {
    const rs = [R('aud', false, 'https://cdn.test/a1.m3u8'), R('aud', true, 'https://cdn.test/a2.m3u8')];
    expect(selectAudioRendition(rs, V('aud'))?.uri).toBe('https://cdn.test/a2.m3u8');
  });

  it('falls back to the first rendition with a URI when none is DEFAULT', () => {
    const rs = [R('aud', false, 'https://cdn.test/a1.m3u8'), R('aud', false, 'https://cdn.test/a2.m3u8')];
    expect(selectAudioRendition(rs, V('aud'))?.uri).toBe('https://cdn.test/a1.m3u8');
  });

  it('returns undefined when the variant names no group', () => {
    expect(selectAudioRendition([R('aud', true, 'https://cdn.test/a.m3u8')], V(undefined))).toBeUndefined();
  });

  it('returns undefined when no rendition in the group has a URI (audio is muxed in)', () => {
    expect(selectAudioRendition([R('aud', true, undefined)], V('aud'))).toBeUndefined();
  });

  it('returns undefined when the group id does not match', () => {
    expect(selectAudioRendition([R('other', true, 'https://cdn.test/a.m3u8')], V('aud'))).toBeUndefined();
  });
});

const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../../fixtures/dash', name)));

/** Parse an MP4's tracks back out to assert what captureHls muxed. */
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

describe('captureHls — demuxed fMP4 audio', () => {
  const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",DEFAULT=YES,URI="audio/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud"
video/v.m3u8
`;
  const VIDEO_PL = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="v_init.m4v"
#EXTINF:6.0,
v_seg1.m4v
#EXT-X-ENDLIST
`;
  const AUDIO_PL = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="a_init.m4a"
#EXTINF:6.0,
a_seg1.m4a
#EXT-X-ENDLIST
`;
  const deps = (audioPl = AUDIO_PL): HlsDeps => ({
    fetchText: async (u: string) => {
      if (u.endsWith('master.m3u8')) return MASTER;
      if (u.endsWith('v.m3u8')) return VIDEO_PL;
      if (u.endsWith('en.m3u8')) return audioPl;
      throw new Error(`no text ${u}`);
    },
    fetchBytes: async (u: string) => fx(u.split('/').pop()!),
    decrypt: async (_k, _iv, d) => d,
  });

  it('muxes the separate audio rendition into the video → mp4 with both tracks', async () => {
    const res = await captureHls('https://cdn.test/master.m3u8', deps());
    expect(res.ext).toBe('mp4');
    expect(res.muxedAudio).toBe(true);
    expect(String.fromCharCode(res.bytes[4], res.bytes[5], res.bytes[6], res.bytes[7])).toBe('ftyp');
    const tracks = tracksOf(res.bytes);
    expect(tracks).toHaveLength(2);
    expect(tracks.some((t) => t.type === 'video')).toBe(true);
    expect(tracks.some((t) => t.type === 'audio')).toBe(true);
  });

  it('reports combined progress across both tracks', async () => {
    const calls: [number, number][] = [];
    const d = { ...deps(), onProgress: (done: number, total: number) => calls.push([done, total]) };
    await captureHls('https://cdn.test/master.m3u8', d);
    expect(calls[calls.length - 1]).toEqual([2, 2]); // 1 video + 1 audio segment
  });

  it('throws too-large when the summed track bytes exceed maxBytes', async () => {
    // 100000 is between the video segment (92461 B) and video+audio (126093 B),
    // so the video track passes its own budget check and only the audio bytes,
    // added to the SAME shared budget, tip it over — proving cross-track accrual.
    await expect(captureHls('https://cdn.test/master.m3u8', deps(), { maxBytes: 100000 })).rejects.toMatchObject({
      code: 'too-large',
    });
  });

  it('throws demuxed-unsupported when the separate audio is not fMP4 (MPEG-TS)', async () => {
    const AUDIO_TS = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.0,
a_seg0.ts
#EXT-X-ENDLIST
`;
    await expect(captureHls('https://cdn.test/master.m3u8', deps(AUDIO_TS))).rejects.toMatchObject({
      code: 'demuxed-unsupported',
    });
  });

  it('throws demuxed-unsupported when mp4box cannot mux the fMP4 tracks', async () => {
    // Audio playlist advertises fMP4 (EXT-X-MAP present) so it clears the init
    // guard, but its bytes are not decodable fMP4 → muxTracks throws → fail loud.
    const AUDIO_BAD = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="bad_init.m4a"
#EXTINF:6.0,
bad_seg.m4a
#EXT-X-ENDLIST
`;
    const d: HlsDeps = {
      ...deps(AUDIO_BAD),
      fetchBytes: async (u: string) => {
        const name = u.split('/').pop()!;
        return name.startsWith('bad_') ? new Uint8Array([1, 2, 3, 4]) : fx(name);
      },
    };
    // mp4box logs its own BoxParser/ISOFile parse failure to console.error while
    // rejecting the undecodable bytes — expected on this path (we assert the
    // rejection), so mute it to keep the test output clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(captureHls('https://cdn.test/master.m3u8', d)).rejects.toMatchObject({
        code: 'demuxed-unsupported',
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it('throws empty when the demuxed muxer returns zero bytes', async () => {
    // muxTracks succeeds without throwing but yields an empty file — the guard
    // after the mux must surface `empty`, not a silent zero-byte download.
    const spy = vi.spyOn(mux, 'muxTracks').mockReturnValueOnce(new Uint8Array(0));
    try {
      await expect(captureHls('https://cdn.test/master.m3u8', deps())).rejects.toMatchObject({ code: 'empty' });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps a muxed fMP4 (audio group present but no rendition URI) on the concat path', async () => {
    // The audio rendition carries no URI → audio is muxed into the variant →
    // selectAudioRendition returns undefined → the unchanged concat path runs.
    const MASTER_MUXED = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",DEFAULT=YES
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud"
video/v.m3u8
`;
    const d: HlsDeps = {
      fetchText: async (u: string) => {
        if (u.endsWith('master.m3u8')) return MASTER_MUXED;
        if (u.endsWith('v.m3u8')) return VIDEO_PL;
        throw new Error(`no text ${u}`);
      },
      fetchBytes: async (u: string) => fx(u.split('/').pop()!),
      decrypt: async (_k, _iv, data) => data,
    };
    const res = await captureHls('https://cdn.test/master.m3u8', d);
    expect(res.muxedAudio).toBeFalsy();
    expect(res.ext).toBe('mp4'); // fMP4 concat (EXT-X-MAP present), not muxed
  });
});
