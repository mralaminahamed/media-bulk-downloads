import { readFileSync } from 'fs';
import { join } from 'path';
import * as MP4Box from 'mp4box';
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
});
