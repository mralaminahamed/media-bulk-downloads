/**
 * hls.ts — generic HLS (HTTP Live Streaming) capture engine.
 *
 * Pure and deterministic: no network, DOM, or crypto of its own — the caller
 * injects `fetchText` / `fetchBytes` / `decrypt`. This lets the same engine run
 * in the service worker (real fetch + WebCrypto), in an offscreen document, and
 * in tests / Node validation (node:crypto, canned fixtures).
 *
 * It turns a `.m3u8` master or media playlist into one assembled file:
 *   master  → pick a variant (highest bandwidth by default) → its media playlist
 *   media   → fetch the init segment (fMP4) + every media segment, in order,
 *             decrypting AES-128 segments, and concatenate the bytes.
 *
 * MPEG-TS (`.ts`) segments concatenate into a playable `.ts`; fMP4 (`.m4s`)
 * segments prefixed with their `EXT-X-MAP` init concatenate into an `.mp4`.
 *
 * POLICY LINE: standard HLS AES-128 (the key is served openly in the manifest to
 * every client) is supported. DRM — SAMPLE-AES / Widevine / PlayReady / FairPlay
 * (keyformat identifiers, EXT-X-SESSION-KEY) — is REFUSED: circumventing it would
 * breach the DMCA and Chrome Web Store policy. Live playlists (no EXT-X-ENDLIST)
 * are refused too — they have no finite end, so there is no single file to save.
 */

export type HlsErrorCode =
  | 'no-variants' // master playlist had no usable EXT-X-STREAM-INF
  | 'live' // media playlist has no EXT-X-ENDLIST — not a finite file
  | 'drm' // Widevine/PlayReady/FairPlay or EXT-X-SESSION-KEY
  | 'sample-aes' // SAMPLE-AES — DRM-adjacent, not plain AES-128
  | 'unsupported-key' // an EXT-X-KEY METHOD we don't implement
  | 'empty' // playlist had no segments, or nothing downloaded
  | 'too-large' // assembled bytes exceeded opts.maxBytes
  | 'fetch-failed'; // a segment or key could not be fetched

export class HlsError extends Error {
  code: HlsErrorCode;
  constructor(code: HlsErrorCode, message: string) {
    super(message);
    this.name = 'HlsError';
    this.code = code;
  }
}

export interface HlsVariant {
  uri: string; // absolute
  bandwidth: number; // bits/sec (AVERAGE-BANDWIDTH preferred, else BANDWIDTH)
  resolution?: { width: number; height: number };
  codecs?: string;
  name?: string;
  audioGroup?: string; // the STREAM-INF AUDIO="…" group id (demuxed audio lives there)
}

/** An `#EXT-X-MEDIA:TYPE=AUDIO` rendition. A `uri` means the audio is a separate
 *  (demuxed) track; its absence means the audio is muxed into the video variant. */
export interface HlsAudioRendition {
  groupId: string;
  name?: string;
  language?: string;
  isDefault: boolean;
  uri?: string; // absolute
}

export interface HlsKey {
  method: string; // 'AES-128' | 'NONE' | 'SAMPLE-AES' | …
  uri?: string; // absolute key URI (AES-128)
  iv?: Uint8Array; // explicit 16-byte IV, when the tag carried one
  keyformat?: string; // present for DRM (e.g. 'com.widevine…')
}

export interface HlsByteRange {
  length: number;
  offset: number;
}

export interface HlsSegment {
  uri: string; // absolute
  duration: number; // seconds (EXTINF)
  seq: number; // media sequence number (for IV derivation)
  key?: HlsKey; // the EXT-X-KEY in force for this segment (carried forward)
  byteRange?: HlsByteRange;
}

export interface HlsMediaPlaylist {
  segments: HlsSegment[];
  initUri?: string; // EXT-X-MAP:URI (fMP4)
  initByteRange?: HlsByteRange;
  isLive: boolean; // no EXT-X-ENDLIST
  targetDuration: number;
  totalDuration: number;
}

/** AES-128-CBC decrypt: (rawKey16, iv16, ciphertext) → plaintext. Injected so the
 *  engine stays crypto-free (WebCrypto in the SW, node:crypto in tests). */
export type DecryptFn = (key: Uint8Array, iv: Uint8Array, data: Uint8Array) => Promise<Uint8Array>;

export interface HlsDeps {
  fetchText: (url: string) => Promise<string>;
  /** `range` (when set) must be honoured with a Range request. */
  fetchBytes: (url: string, range?: HlsByteRange) => Promise<Uint8Array>;
  decrypt: DecryptFn;
  /** Bounded parallel segment fetches (default 6). */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface HlsCaptureOptions {
  /** 'highest' (default) or 'lowest' bandwidth, or a target height (e.g. 720). */
  quality?: 'highest' | 'lowest' | number;
  /** Refuse once the running assembled size would exceed this (bytes). */
  maxBytes?: number;
}

export interface HlsCaptureResult {
  bytes: Uint8Array;
  ext: 'ts' | 'mp4' | 'aac';
  mime: string;
  variant?: HlsVariant;
  segmentCount: number;
  durationSec: number;
}

// ---- parsing -------------------------------------------------------------

const DRM_KEYFORMATS = /widevine|playready|fairplay|com\.apple\.streamingkeydelivery|urn:uuid/i;

/** Splits an `#EXT…:a=1,b="x,y"` attribute list, respecting quoted commas. */
function parseAttributes(list: string): Record<string, string> {
  const out: Record<string, string> = {};
  // key=value, value either "quoted" (may contain commas) or bare up to the next comma
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(list))) {
    out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2];
  }
  return out;
}

export function isMasterPlaylist(text: string): boolean {
  return /^#EXT-X-STREAM-INF:/m.test(text);
}

/** Parses a master playlist into its variant streams, absolute-resolved. */
export function parseMaster(text: string, baseUrl: string): HlsVariant[] {
  const lines = text.split(/\r?\n/);
  const variants: HlsVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
    // The URI is the next non-comment, non-empty line.
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j].trim();
      if (cand && !cand.startsWith('#')) {
        uri = cand;
        i = j;
        break;
      }
    }
    if (!uri) continue;
    const res = attrs.RESOLUTION?.match(/(\d+)x(\d+)/);
    variants.push({
      uri: new URL(uri, baseUrl).href,
      bandwidth: Number(attrs['AVERAGE-BANDWIDTH'] || attrs.BANDWIDTH || 0),
      resolution: res ? { width: Number(res[1]), height: Number(res[2]) } : undefined,
      codecs: attrs.CODECS,
      name: attrs.NAME,
      audioGroup: attrs.AUDIO || undefined,
    });
  }
  return variants;
}

/** Parses `#EXT-X-MEDIA:TYPE=AUDIO` renditions from a master playlist,
 *  absolute-resolving each URI. Non-audio media (subtitles, closed captions) is
 *  ignored — only audio can be muxed back into the video. */
export function parseAudioRenditions(text: string, baseUrl: string): HlsAudioRendition[] {
  const out: HlsAudioRendition[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const a = parseAttributes(line.slice('#EXT-X-MEDIA:'.length));
    if (a.TYPE !== 'AUDIO') continue;
    out.push({
      groupId: a['GROUP-ID'] ?? '',
      name: a.NAME || undefined,
      language: a.LANGUAGE || undefined,
      isDefault: a.DEFAULT === 'YES',
      uri: a.URI ? new URL(a.URI, baseUrl).href : undefined,
    });
  }
  return out;
}

/** Picks the variant matching the quality preference. */
export function selectVariant(variants: HlsVariant[], quality: HlsCaptureOptions['quality'] = 'highest'): HlsVariant {
  if (!variants.length) throw new HlsError('no-variants', 'Master playlist had no variant streams.');
  const byBandwidth = [...variants].sort((a, b) => a.bandwidth - b.bandwidth);
  if (quality === 'lowest') return byBandwidth[0];
  if (typeof quality === 'number') {
    // The variant whose height is closest to the target (ties → higher bandwidth).
    const withHeight = variants.filter((v) => v.resolution);
    if (withHeight.length) {
      return withHeight.sort(
        (a, b) =>
          Math.abs(a.resolution!.height - quality) - Math.abs(b.resolution!.height - quality) ||
          b.bandwidth - a.bandwidth,
      )[0];
    }
  }
  return byBandwidth[byBandwidth.length - 1]; // highest
}

function parseByteRange(value: string, prevEnd: number): HlsByteRange {
  // EXT-X-BYTERANGE:<length>[@<offset>] — offset defaults to the byte after the
  // previous sub-range of the same resource.
  const [len, off] = value.split('@');
  const length = Number(len);
  const offset = off !== undefined ? Number(off) : prevEnd;
  return { length, offset };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/** Parses a media playlist: segments (with carried-forward keys + byte ranges),
 *  the optional fMP4 init segment, and live/VOD + duration metadata. */
export function parseMediaPlaylist(text: string, baseUrl: string): HlsMediaPlaylist {
  const lines = text.split(/\r?\n/);
  const segments: HlsSegment[] = [];
  let seq = 0; // set from EXT-X-MEDIA-SEQUENCE; increments per segment
  let seqSet = false;
  let currentKey: HlsKey | undefined;
  let pendingDuration = 0;
  let pendingByteRange: HlsByteRange | undefined;
  let lastByteEnd = 0;
  let initUri: string | undefined;
  let initByteRange: HlsByteRange | undefined;
  let isLive = true;
  let targetDuration = 0;
  let totalDuration = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        seq = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length));
        seqSet = true;
      } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = Number(line.slice('#EXT-X-TARGETDURATION:'.length));
      } else if (line.startsWith('#EXTINF:')) {
        pendingDuration = parseFloat(line.slice('#EXTINF:'.length));
      } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
        pendingByteRange = parseByteRange(line.slice('#EXT-X-BYTERANGE:'.length), lastByteEnd);
      } else if (line.startsWith('#EXT-X-KEY:')) {
        const a = parseAttributes(line.slice('#EXT-X-KEY:'.length));
        currentKey =
          a.METHOD === 'NONE'
            ? undefined
            : {
                method: a.METHOD,
                uri: a.URI ? new URL(a.URI, baseUrl).href : undefined,
                iv: a.IV ? hexToBytes(a.IV) : undefined,
                keyformat: a.KEYFORMAT,
              };
      } else if (line.startsWith('#EXT-X-MAP:')) {
        const a = parseAttributes(line.slice('#EXT-X-MAP:'.length));
        if (a.URI) initUri = new URL(a.URI, baseUrl).href;
        if (a.BYTERANGE) initByteRange = parseByteRange(a.BYTERANGE, 0);
      } else if (line.startsWith('#EXT-X-ENDLIST')) {
        isLive = false;
      }
      continue;
    }
    // A media segment URI line.
    const segment: HlsSegment = {
      uri: new URL(line, baseUrl).href,
      duration: pendingDuration,
      seq: seqSet ? seq : segments.length,
      key: currentKey,
      byteRange: pendingByteRange,
    };
    segments.push(segment);
    totalDuration += pendingDuration || 0;
    if (pendingByteRange) lastByteEnd = pendingByteRange.offset + pendingByteRange.length;
    seq += 1;
    pendingDuration = 0;
    pendingByteRange = undefined;
  }

  return { segments, initUri, initByteRange, isLive, targetDuration, totalDuration };
}

// ---- assembly ------------------------------------------------------------

/** 16-byte big-endian IV from a media sequence number (HLS default when the
 *  EXT-X-KEY carries no explicit IV). */
export function ivFromSequence(seq: number): Uint8Array {
  const iv = new Uint8Array(16);
  // sequence numbers fit in 32 bits in practice; write into the low 4 bytes.
  new DataView(iv.buffer).setUint32(12, seq >>> 0, false);
  return iv;
}

function guessContainer(segUri: string, hasInit: boolean): HlsCaptureResult['ext'] {
  if (hasInit) return 'mp4'; // fMP4 (EXT-X-MAP present)
  const path = segUri.split('?')[0].toLowerCase();
  if (path.endsWith('.m4s') || path.endsWith('.mp4')) return 'mp4';
  if (path.endsWith('.aac')) return 'aac';
  return 'ts'; // MPEG-TS is the overwhelming default
}

const MIME: Record<HlsCaptureResult['ext'], string> = {
  ts: 'video/mp2t',
  mp4: 'video/mp4',
  aac: 'audio/aac',
};

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Guards against DRM / unsupported encryption before any bytes are fetched.
 * Throws HlsError; returns cleanly for plain AES-128 or clear content.
 */
export function assertDownloadable(pl: HlsMediaPlaylist): void {
  if (pl.isLive) throw new HlsError('live', 'This is a live stream (no end) — there is no single file to save.');
  if (!pl.segments.length) throw new HlsError('empty', 'Playlist contained no media segments.');
  for (const seg of pl.segments) {
    const k = seg.key;
    if (!k) continue;
    if (k.keyformat && DRM_KEYFORMATS.test(k.keyformat)) {
      throw new HlsError('drm', 'This stream is DRM-protected and cannot be captured.');
    }
    if (k.method === 'SAMPLE-AES') {
      throw new HlsError('sample-aes', 'SAMPLE-AES encryption is not supported.');
    }
    if (k.method !== 'AES-128') {
      throw new HlsError('unsupported-key', `Unsupported encryption method: ${k.method}.`);
    }
  }
}

// ---- orchestration -------------------------------------------------------

/**
 * Full capture: master/media URL → assembled file bytes. Fetches the media
 * playlist (resolving a master first), refuses live/DRM, then downloads the init
 * + every segment in order (bounded concurrency), decrypting AES-128 as needed.
 */
export async function captureHls(
  url: string,
  deps: HlsDeps,
  opts: HlsCaptureOptions = {},
): Promise<HlsCaptureResult> {
  const rootText = await deps.fetchText(url);

  let mediaUrl = url;
  let variant: HlsVariant | undefined;
  if (isMasterPlaylist(rootText)) {
    variant = selectVariant(parseMaster(rootText, url), opts.quality);
    mediaUrl = variant.uri;
  }

  const mediaText = mediaUrl === url && !variant ? rootText : await deps.fetchText(mediaUrl);
  const playlist = parseMediaPlaylist(mediaText, mediaUrl);
  assertDownloadable(playlist);

  const ext = guessContainer(playlist.segments[0].uri, !!playlist.initUri);

  // Fetch + cache each distinct AES-128 key once.
  const keyCache = new Map<string, Promise<Uint8Array>>();
  const getKey = (keyUri: string): Promise<Uint8Array> => {
    let p = keyCache.get(keyUri);
    if (!p) {
      p = deps.fetchBytes(keyUri).then((b) => {
        if (b.length !== 16) throw new HlsError('fetch-failed', 'AES-128 key was not 16 bytes.');
        return b;
      });
      keyCache.set(keyUri, p);
    }
    return p;
  };

  const total = playlist.segments.length;
  const parts: Uint8Array[] = new Array(total);
  let done = 0;
  let bytesTotal = 0;
  let cursor = 0;

  const fetchSegment = async (seg: HlsSegment): Promise<Uint8Array> => {
    const raw = await deps.fetchBytes(seg.uri, seg.byteRange);
    if (!seg.key || seg.key.method !== 'AES-128' || !seg.key.uri) return raw;
    const key = await getKey(seg.key.uri);
    const iv = seg.key.iv ?? ivFromSequence(seg.seq);
    return deps.decrypt(key, iv, raw);
  };

  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const i = cursor++;
      const bytes = await fetchSegment(playlist.segments[i]);
      parts[i] = bytes;
      bytesTotal += bytes.length;
      if (opts.maxBytes && bytesTotal > opts.maxBytes) {
        throw new HlsError('too-large', 'Stream exceeds the maximum capture size.');
      }
      deps.onProgress?.(++done, total);
    }
  };

  const limit = Math.max(1, deps.concurrency ?? 6);
  await Promise.all(Array.from({ length: Math.min(limit, total) }, worker));

  const chunks: Uint8Array[] = [];
  if (playlist.initUri) chunks.push(await deps.fetchBytes(playlist.initUri, playlist.initByteRange));
  chunks.push(...parts);
  const bytes = concat(chunks);
  if (!bytes.length) throw new HlsError('empty', 'Nothing was downloaded from the stream.');

  return {
    bytes,
    ext,
    mime: MIME[ext],
    variant,
    segmentCount: total,
    durationSec: Math.round(playlist.totalDuration),
  };
}
