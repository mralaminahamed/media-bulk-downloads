/**
 * Raw metadata copy for the format-conversion path (issue #199). Canvas
 * re-encoding drops all embedded metadata, so we extract the raw EXIF (TIFF
 * block) and XMP (packet) bytes from the SOURCE container and re-inject them into
 * the converted JPEG/PNG. We never parse metadata into fields — the opaque
 * payloads are copied verbatim, which is format-agnostic and loss-free.
 *
 * Sources: JPEG, PNG, WebP, AVIF/ISOBMFF. Targets: JPEG, PNG.
 */

export interface ImageMetadata {
  /** Raw EXIF TIFF block (begins with the "II*\0" / "MM\0*" byte-order mark). */
  exif?: Uint8Array;
  /** Raw XMP packet (the `<?xpacket…</x:xmpmeta>` XML). */
  xmp?: Uint8Array;
}

const XMP_NS = 'http://ns.adobe.com/xap/1.0/';
const XMP_PNG_KEYWORD = 'XML:com.adobe.xmp';
const EXIF_SIG = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

const bytesOf = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const ascii = (b: Uint8Array, o: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]);
  return s;
};
const u16be = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const matchBytes = (b: Uint8Array, o: number, sig: number[]): boolean =>
  o + sig.length <= b.length && sig.every((v, i) => b[o + i] === v);
const indexOfByte = (b: Uint8Array, val: number, from: number, to: number): number => {
  for (let i = from; i < to && i < b.length; i++) if (b[i] === val) return i;
  return -1;
};
const concat = (parts: Uint8Array[]): Uint8Array => {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** Extract raw EXIF + XMP from a source image blob. Returns {} for an
 *  unrecognised container or one that carries no metadata. Never throws. */
export async function extractMetadata(blob: Blob): Promise<ImageMetadata> {
  try {
    const b = new Uint8Array(await blob.arrayBuffer());
    if (matchBytes(b, 0, [0xff, 0xd8, 0xff])) return extractFromJpeg(b);
    if (matchBytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return extractFromPng(b);
    if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return extractFromWebp(b);
    if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') return extractFromIsobmff(b);
    return {};
  } catch {
    return {};
  }
}

function extractFromJpeg(b: Uint8Array): ImageMetadata {
  const meta: ImageMetadata = {};
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) break;
    const marker = b[o + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = u16be(b, o + 2);
    if (len < 2) break;
    const segStart = o + 4;
    const segEnd = o + 2 + len;
    if (segEnd > b.length) break;
    if (marker === 0xe1) { // APP1 — EXIF or XMP
      if (!meta.exif && matchBytes(b, segStart, EXIF_SIG)) {
        meta.exif = b.slice(segStart + 6, segEnd);
      } else if (!meta.xmp && ascii(b, segStart, XMP_NS.length) === XMP_NS && b[segStart + XMP_NS.length] === 0) {
        meta.xmp = b.slice(segStart + XMP_NS.length + 1, segEnd);
      }
    }
    o = segEnd;
  }
  return meta;
}

function extractFromPng(b: Uint8Array): ImageMetadata {
  const meta: ImageMetadata = {};
  let o = 8;
  while (o + 8 <= b.length) {
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    const dataStart = o + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > b.length) break;
    if (type === 'IEND') break;
    if (type === 'eXIf' && !meta.exif) {
      meta.exif = b.slice(dataStart, dataEnd);
    } else if (type === 'iTXt' && !meta.xmp) {
      const kwEnd = indexOfByte(b, 0, dataStart, dataEnd);
      if (kwEnd >= 0 && ascii(b, dataStart, kwEnd - dataStart) === XMP_PNG_KEYWORD) {
        const compFlag = b[kwEnd + 1];
        let p = kwEnd + 3;
        p = indexOfByte(b, 0, p, dataEnd) + 1;
        p = indexOfByte(b, 0, p, dataEnd) + 1;
        if (compFlag === 0 && p > 0 && p <= dataEnd) meta.xmp = b.slice(p, dataEnd);
      }
    }
    o = dataEnd + 4;
  }
  return meta;
}

function extractFromWebp(b: Uint8Array): ImageMetadata {
  const meta: ImageMetadata = {};
  let o = 12;
  while (o + 8 <= b.length) {
    const fourcc = ascii(b, o, 4);
    const size = u32le(b, o + 4);
    const dataStart = o + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > b.length) break;
    if (fourcc === 'EXIF' && !meta.exif) {
      const s = matchBytes(b, dataStart, EXIF_SIG) ? dataStart + 6 : dataStart;
      meta.exif = b.slice(s, dataEnd);
    } else if (fourcc === 'XMP ' && !meta.xmp) {
      meta.xmp = b.slice(dataStart, dataEnd);
    }
    o = dataEnd + (size & 1);
  }
  return meta;
}

function extractFromIsobmff(b: Uint8Array): ImageMetadata {
  const meta: ImageMetadata = {};
  const metaBox = findBox(b, 0, b.length, 'meta', true);
  if (!metaBox) return {};
  const iinf = findBox(b, metaBox.start, metaBox.end, 'iinf', true);
  const iloc = findBox(b, metaBox.start, metaBox.end, 'iloc', true);
  if (!iinf || !iloc) return {};
  const items = parseIinf(b, iinf.start, iinf.end);
  const locs = parseIloc(b, iloc.start, iloc.end);
  for (const [id, kind] of items) {
    const loc = locs.get(id);
    if (!loc || loc.offset + loc.length > b.length) continue;
    const data = b.slice(loc.offset, loc.offset + loc.length);
    if (kind === 'exif' && !meta.exif) {
      const skip = data.length >= 4 ? 4 + u32be(data, 0) : 0;
      if (skip <= data.length) meta.exif = data.slice(skip);
    } else if (kind === 'xmp' && !meta.xmp) {
      meta.xmp = data;
    }
  }
  return meta;
}

/** Locate a child box by type within [start,end). `full` skips the 4-byte
 *  version/flags of a FullBox to return the position of its first child. */
function findBox(
  b: Uint8Array,
  start: number,
  end: number,
  type: string,
  full: boolean,
): { start: number; end: number } | null {
  let o = start;
  while (o + 8 <= end) {
    let size = u32be(b, o);
    const boxType = ascii(b, o + 4, 4);
    let header = 8;
    if (size === 1) { // 64-bit size — use the low 32 bits (payloads here are small)
      if (o + 16 > end) break;
      size = u32be(b, o + 12);
      header = 16;
    }
    if (size < header) break;
    const boxEnd = o + size;
    if (boxEnd > end) break;
    if (boxType === type) {
      const childStart = o + header + (full ? 4 : 0);
      return { start: childStart, end: boxEnd };
    }
    o = boxEnd;
  }
  return null;
}

function parseIinf(b: Uint8Array, start: number, end: number): Map<number, 'exif' | 'xmp'> {
  const out = new Map<number, 'exif' | 'xmp'>();
  const version = b[start - 4];
  let o = start + (version >= 1 ? 4 : 2);
  while (o + 8 <= end) {
    const size = u32be(b, o);
    const boxType = ascii(b, o + 4, 4);
    if (size < 8 || o + size > end) break;
    if (boxType === 'infe') {
      const ver = b[o + 8];
      let p = o + 12;
      if (ver >= 2) {
        const id = ver === 2 ? u16be(b, p) : u32be(b, p);
        p += ver === 2 ? 2 : 4;
        p += 2;
        const itemType = ascii(b, p, 4);
        if (itemType === 'Exif') out.set(id, 'exif');
        else if (itemType === 'mime') {
          const ct = ascii(b, p + 4, end - (p + 4));
          if (ct.startsWith('application/rdf+xml')) out.set(id, 'xmp');
        }
      }
    }
    o += size;
  }
  return out;
}

function parseIloc(b: Uint8Array, start: number, end: number): Map<number, { offset: number; length: number }> {
  const out = new Map<number, { offset: number; length: number }>();
  const version = b[start - 4];
  let o = start;
  const readN = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[o + i];
    o += n;
    return v;
  };
  const offsetSize = b[o] >> 4;
  const lengthSize = b[o] & 0x0f;
  const baseOffsetSize = b[o + 1] >> 4;
  o += 2;
  const itemCount = version < 2 ? u16be(b, o) : u32be(b, o);
  o += version < 2 ? 2 : 4;
  for (let i = 0; i < itemCount && o < end; i++) {
    const id = version < 2 ? u16be(b, o) : u32be(b, o);
    o += version < 2 ? 2 : 4;
    if (version === 1 || version === 2) o += 2;
    o += 2;
    const baseOffset = readN(baseOffsetSize);
    const extentCount = u16be(b, o);
    o += 2;
    let first: { offset: number; length: number } | null = null;
    for (let e = 0; e < extentCount && o < end; e++) {
      const extentOffset = readN(offsetSize);
      const extentLength = readN(lengthSize);
      if (!first) first = { offset: baseOffset + extentOffset, length: extentLength };
    }
    if (first) out.set(id, first);
  }
  return out;
}

/** Re-inject metadata into converted output bytes. Returns the original bytes
 *  unchanged when there is nothing to inject, or null when the metadata cannot
 *  fit the target container (so the caller falls back to the original file). */
export function injectMetadata(
  bytes: Uint8Array,
  target: 'jpeg' | 'png',
  meta: ImageMetadata,
): Uint8Array | null {
  if (!meta.exif && !meta.xmp) return bytes;
  return target === 'jpeg' ? injectIntoJpeg(bytes, meta) : injectIntoPng(bytes, meta);
}

const XMP_JPEG_PREFIX = bytesOf(XMP_NS + '\0');

function app1(prefix: Uint8Array, payload: Uint8Array): Uint8Array | null {
  const len = 2 + prefix.length + payload.length;
  if (len > 0xffff) return null;
  const out = new Uint8Array(4 + prefix.length + payload.length);
  out[0] = 0xff;
  out[1] = 0xe1;
  out[2] = (len >> 8) & 0xff;
  out[3] = len & 0xff;
  out.set(prefix, 4);
  out.set(payload, 4 + prefix.length);
  return out;
}

function injectIntoJpeg(b: Uint8Array, meta: ImageMetadata): Uint8Array | null {
  if (b.length < 2 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const segs: Uint8Array[] = [];
  if (meta.exif) {
    const s = app1(Uint8Array.from(EXIF_SIG), meta.exif);
    if (!s) return null;
    segs.push(s);
  }
  if (meta.xmp) {
    const s = app1(XMP_JPEG_PREFIX, meta.xmp);
    if (!s) return null;
    segs.push(s);
  }
  if (!segs.length) return b;
  return concat([b.slice(0, 2), ...segs, b.slice(2)]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = bytesOf(type);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(concat([typeBytes, data])));
  return out;
}

function buildXmpITxt(xmp: Uint8Array): Uint8Array {
  const kw = bytesOf(XMP_PNG_KEYWORD);
  const header = new Uint8Array(kw.length + 5);
  header.set(kw, 0);
  return concat([header, xmp]);
}

function injectIntoPng(b: Uint8Array, meta: ImageMetadata): Uint8Array | null {
  if (b.length < 16 || !matchBytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  const ihdrLen = u32be(b, 8);
  const insertAt = 8 + 8 + ihdrLen + 4;
  if (insertAt > b.length) return null;
  const chunks: Uint8Array[] = [];
  if (meta.exif) chunks.push(pngChunk('eXIf', meta.exif));
  if (meta.xmp) chunks.push(pngChunk('iTXt', buildXmpITxt(meta.xmp)));
  if (!chunks.length) return b;
  return concat([b.slice(0, insertAt), ...chunks, b.slice(insertAt)]);
}
