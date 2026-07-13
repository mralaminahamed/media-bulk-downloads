import { extractMetadata, injectMetadata } from '@mbd/core/download/convert/metadata';

// ---- byte builders ---------------------------------------------------------

const bytes = (...a: number[]): Uint8Array => Uint8Array.from(a);
const str = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const u16 = (n: number): Uint8Array => bytes((n >> 8) & 255, n & 255);
const u32 = (n: number): Uint8Array => bytes((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const u32le = (n: number): Uint8Array => bytes(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
const cat = (...ps: Uint8Array[]): Uint8Array => {
  let n = 0;
  for (const p of ps) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of ps) { out.set(p, o); o += p.length; }
  return out;
};

// Distinctive opaque payloads — the copy is byte-for-byte, so content is arbitrary.
const EXIF = cat(str('II'), bytes(0x2a, 0x00), u32(8), bytes(0xde, 0xad, 0xbe, 0xef, 0x01, 0x02));
const XMP = str('<?xpacket begin="?"><x:xmpmeta>rights: ACME</x:xmpmeta><?xpacket end="w"?>');
const XMP_NS = 'http://ns.adobe.com/xap/1.0/';

// ---- source-container builders ---------------------------------------------

const jpegApp1 = (prefix: Uint8Array, payload: Uint8Array): Uint8Array =>
  cat(bytes(0xff, 0xe1), u16(2 + prefix.length + payload.length), prefix, payload);

const buildJpeg = (exif?: Uint8Array, xmp?: Uint8Array): Uint8Array =>
  cat(
    bytes(0xff, 0xd8),
    exif ? jpegApp1(str('Exif\0\0'), exif) : new Uint8Array(0),
    xmp ? jpegApp1(str(XMP_NS + '\0'), xmp) : new Uint8Array(0),
    bytes(0xff, 0xda, 0x00, 0x02, 0xff, 0xd9), // SOS then EOI (metadata is all before SOS)
  );

const pngChunkRaw = (type: string, data: Uint8Array): Uint8Array =>
  cat(u32(data.length), str(type), data, u32(0)); // CRC not validated on read

const buildPng = (exif?: Uint8Array, xmp?: Uint8Array): Uint8Array =>
  cat(
    bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunkRaw('IHDR', new Uint8Array(13)),
    exif ? pngChunkRaw('eXIf', exif) : new Uint8Array(0),
    // iTXt: keyword \0 compFlag(0) compMethod(0) lang\0 trans\0 text
    xmp ? pngChunkRaw('iTXt', cat(str('XML:com.adobe.xmp'), bytes(0, 0, 0, 0, 0), xmp)) : new Uint8Array(0),
    pngChunkRaw('IEND', new Uint8Array(0)),
  );

const webpChunk = (fourcc: string, data: Uint8Array): Uint8Array =>
  cat(str(fourcc), u32le(data.length), data, data.length & 1 ? bytes(0) : new Uint8Array(0));

const buildWebp = (exif?: Uint8Array, xmp?: Uint8Array): Uint8Array => {
  const body = cat(
    str('WEBP'),
    exif ? webpChunk('EXIF', exif) : new Uint8Array(0),
    xmp ? webpChunk('XMP ', xmp) : new Uint8Array(0),
  );
  return cat(str('RIFF'), u32le(body.length), body);
};

const box = (type: string, ...payload: Uint8Array[]): Uint8Array => {
  const body = cat(...payload);
  return cat(u32(8 + body.length), str(type), body);
};

// Minimal AVIF: [ftyp][mdat: exifItem, xmpItem][meta: iinf, iloc]. iloc extent
// offsets are ABSOLUTE file offsets, computed once mdat's position is known.
const buildAvif = (exif?: Uint8Array, xmp?: Uint8Array): Uint8Array => {
  const ftyp = box('ftyp', str('avif'), u32(0), str('avif'), str('mif1'));
  const exifItem = exif ? cat(u32(0), exif) : new Uint8Array(0); // 4-byte tiff-offset prefix + TIFF
  const xmpItem = xmp ?? new Uint8Array(0);
  const mdat = box('mdat', exifItem, xmpItem);
  const mdatDataStart = ftyp.length + 8; // absolute offset of mdat's payload
  const exifOffset = mdatDataStart;
  const xmpOffset = mdatDataStart + exifItem.length;

  const infe = (id: number, itemType: string, contentType?: string): Uint8Array =>
    box('infe', bytes(2, 0, 0, 0), u16(id), u16(0), str(itemType), contentType ? str(contentType + '\0') : new Uint8Array(0));
  const infes: Uint8Array[] = [];
  if (exif) infes.push(infe(1, 'Exif'));
  if (xmp) infes.push(infe(2, 'mime', 'application/rdf+xml'));
  const iinf = box('iinf', bytes(0, 0, 0, 0), u16(infes.length), ...infes);

  const ilocItems: Uint8Array[] = [];
  if (exif) ilocItems.push(cat(u16(1), u16(0), u16(1), u32(exifOffset), u32(exifItem.length)));
  if (xmp) ilocItems.push(cat(u16(2), u16(0), u16(1), u32(xmpOffset), u32(xmpItem.length)));
  // v0 FullBox: offsetSize=4,lengthSize=4 (0x44); baseOffsetSize=0 (0x00); item_count.
  const iloc = box('iloc', bytes(0, 0, 0, 0), bytes(0x44, 0x00), u16(ilocItems.length), ...ilocItems);

  const meta = box('meta', bytes(0, 0, 0, 0), iinf, iloc);
  return cat(ftyp, mdat, meta);
};

// ---- output-container builders (what convertImage's canvas would produce) --

const outputJpeg = (): Uint8Array => cat(bytes(0xff, 0xd8), bytes(0xff, 0xda, 0x00, 0x02, 0xff, 0xd9));
const outputPng = (): Uint8Array =>
  cat(
    bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunkRaw('IHDR', new Uint8Array(13)),
    pngChunkRaw('IDAT', bytes(1, 2, 3)),
    pngChunkRaw('IEND', new Uint8Array(0)),
  );

const eq = (a?: Uint8Array, b?: Uint8Array): boolean =>
  !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

// The DOM lib types a Uint8Array as Uint8Array<ArrayBufferLike>, which doesn't
// structurally match BlobPart; the cast is type-only (runtime accepts it fine).
const blobOf = (b: Uint8Array): Blob => new Blob([b as unknown as BlobPart]);

// ---- tests -----------------------------------------------------------------

describe('extractMetadata', () => {
  it('reads EXIF + XMP from a JPEG', async () => {
    const m = await extractMetadata(blobOf(buildJpeg(EXIF, XMP)));
    expect(eq(m.exif, EXIF)).toBe(true);
    expect(eq(m.xmp, XMP)).toBe(true);
  });
  it('reads EXIF + XMP from a PNG', async () => {
    const m = await extractMetadata(blobOf(buildPng(EXIF, XMP)));
    expect(eq(m.exif, EXIF)).toBe(true);
    expect(eq(m.xmp, XMP)).toBe(true);
  });
  it('reads EXIF + XMP from a WebP', async () => {
    const m = await extractMetadata(blobOf(buildWebp(EXIF, XMP)));
    expect(eq(m.exif, EXIF)).toBe(true);
    expect(eq(m.xmp, XMP)).toBe(true);
  });
  it('reads EXIF + XMP from an AVIF', async () => {
    const m = await extractMetadata(blobOf(buildAvif(EXIF, XMP)));
    expect(eq(m.exif, EXIF)).toBe(true);
    expect(eq(m.xmp, XMP)).toBe(true);
  });
  it('returns {} for a container with no metadata', async () => {
    expect(await extractMetadata(blobOf(buildJpeg()))).toEqual({});
  });
  it('returns {} for an unrecognised blob', async () => {
    expect(await extractMetadata(blobOf(bytes(1, 2, 3, 4, 5, 6, 7, 8)))).toEqual({});
  });
});

describe('injectMetadata round-trip', () => {
  it('JPEG output carries injected EXIF + XMP, re-readable', async () => {
    const meta = await extractMetadata(blobOf(buildAvif(EXIF, XMP))); // AVIF → JPEG (issue case)
    const out = injectMetadata(outputJpeg(), 'jpeg', meta)!;
    const back = await extractMetadata(blobOf(out));
    expect(eq(back.exif, EXIF)).toBe(true);
    expect(eq(back.xmp, XMP)).toBe(true);
  });
  it('PNG output carries injected EXIF + XMP, re-readable', async () => {
    const meta = await extractMetadata(blobOf(buildWebp(EXIF, XMP)));
    const out = injectMetadata(outputPng(), 'png', meta)!;
    const back = await extractMetadata(blobOf(out));
    expect(eq(back.exif, EXIF)).toBe(true);
    expect(eq(back.xmp, XMP)).toBe(true);
  });
  it('returns the output unchanged when there is no metadata', () => {
    const out = outputJpeg();
    expect(injectMetadata(out, 'jpeg', {})).toBe(out);
  });
  it('fails (returns null) when a segment is too large for a JPEG APP1', () => {
    const huge = new Uint8Array(70000);
    expect(injectMetadata(outputJpeg(), 'jpeg', { exif: huge })).toBeNull();
  });
});

describe('injectMetadata is loss-free (strip vs preserve)', () => {
  it('a JPEG without injection carries no metadata (strip behaviour)', async () => {
    const back = await extractMetadata(blobOf(outputJpeg()));
    expect(back).toEqual({});
  });
});
