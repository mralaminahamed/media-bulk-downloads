import { isConvertible, convertImage, isAnimatedImage, ConvertDeps } from '@/extension/shared/download/convert/convert';
import { extractMetadata } from '@/extension/shared/download/convert/metadata';
import { ImageInfo } from '@/types';

const img = (o: Partial<ImageInfo>): ImageInfo =>
  ({ src: 'x', alt: '', width: 0, height: 0, type: 'webp', fileSize: 0, isBase64: false, kind: 'image', ...o });

describe('isConvertible', () => {
  it('converts raster images that are not already the target', () => {
    expect(isConvertible(img({ type: 'webp' }), 'png')).toBe(true);
    expect(isConvertible(img({ type: 'avif' }), 'jpeg')).toBe(true);
    expect(isConvertible(img({ type: 'png' }), 'jpeg')).toBe(true);
  });

  it('skips when already in the target format (jpg == jpeg)', () => {
    expect(isConvertible(img({ type: 'png' }), 'png')).toBe(false);
    expect(isConvertible(img({ type: 'jpeg' }), 'jpeg')).toBe(false);
    expect(isConvertible(img({ type: 'jpg' }), 'jpeg')).toBe(false);
  });

  it('skips svg / gif / ico, non-images, and base64', () => {
    expect(isConvertible(img({ type: 'svg' }), 'png')).toBe(false);
    expect(isConvertible(img({ type: 'gif' }), 'png')).toBe(false);
    expect(isConvertible(img({ type: 'ico' }), 'png')).toBe(false);
    expect(isConvertible(img({ kind: 'video', type: 'mp4' }), 'png')).toBe(false);
    expect(isConvertible(img({ type: 'png', isBase64: true }), 'jpeg')).toBe(false);
  });
});

describe('convertImage', () => {
  type Rec = { filled?: boolean; drawn?: boolean; mime?: string };
  const fakeDeps = (rec: Rec): ConvertDeps => ({
    createImageBitmap: async () => ({ width: 4, height: 2, close: () => undefined }) as unknown as ImageBitmap,
    makeCanvas: () =>
      ({
        getContext: () => ({
          fillStyle: '',
          fillRect: () => { rec.filled = true; },
          drawImage: () => { rec.drawn = true; },
        }),
        convertToBlob: async (opts: { type: string }) => {
          rec.mime = opts.type;
          return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob;
        },
      }) as unknown as OffscreenCanvas,
  });

  it('encodes to png without a white fill', async () => {
    const rec: Rec = {};
    const out = await convertImage(new Blob(), 'png', { deps: fakeDeps(rec) });
    expect(out).toEqual({ bytes: new Uint8Array([1, 2, 3]), ext: 'png', mime: 'image/png' });
    expect(rec.filled).toBeUndefined();
    expect(rec.drawn).toBe(true);
    expect(rec.mime).toBe('image/png');
  });

  it('paints a white background for jpeg (no alpha) and uses a .jpg extension', async () => {
    const rec: Rec = {};
    const out = await convertImage(new Blob(), 'jpeg', { deps: fakeDeps(rec) });
    expect(out?.ext).toBe('jpg');
    expect(out?.mime).toBe('image/jpeg');
    expect(rec.filled).toBe(true);
  });

  it('returns null when decoding throws', async () => {
    const deps: ConvertDeps = {
      createImageBitmap: async () => { throw new Error('undecodable'); },
      makeCanvas: () => ({}) as unknown as OffscreenCanvas,
    };
    expect(await convertImage(new Blob(), 'png', { deps })).toBeNull();
  });

  it('uses the default (global) createImageBitmap + OffscreenCanvas deps when none are injected', async () => {
    // jsdom exposes neither primitive; back both globals so the default deps
    // (createImageBitmap(blob) / new OffscreenCanvas(w,h)) actually run. A null
    // 2D context makes convertImage bail to null after both defaults fired.
    const g = globalThis as unknown as {
      createImageBitmap?: unknown;
      OffscreenCanvas?: unknown;
    };
    const origBitmap = g.createImageBitmap;
    const origCanvas = g.OffscreenCanvas;
    const bitmap = vi.fn(async () => ({ width: 2, height: 2, close: () => undefined }) as unknown as ImageBitmap);
    const canvasCtor = vi.fn(function (this: { getContext: () => null }) {
      this.getContext = () => null;
    });
    g.createImageBitmap = bitmap;
    g.OffscreenCanvas = canvasCtor;
    try {
      // No deps arg → defaultDeps → invokes both globals.
      expect(await convertImage(new Blob(), 'png')).toBeNull();
      expect(bitmap).toHaveBeenCalledTimes(1);
      expect(canvasCtor).toHaveBeenCalledWith(2, 2);
    } finally {
      g.createImageBitmap = origBitmap;
      g.OffscreenCanvas = origCanvas;
    }
  });

  it('with preserveMetadata, copies the source EXIF into the converted output', async () => {
    // Source JPEG carrying an APP1 EXIF segment: FFD8, APP1(Exif\0\0 + TIFF), SOS, EOI.
    const exif = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xaa, 0xbb]);
    const app1Len = 2 + 6 + exif.length; // length field + "Exif\0\0" + payload
    const source = new Blob([
      new Uint8Array([
        0xff, 0xd8,
        0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...exif,
        0xff, 0xda, 0x00, 0x02, 0xff, 0xd9,
      ]) as unknown as BlobPart,
    ]);
    // Deps produce a minimal valid JPEG (SOI + SOS + EOI) that injection can target.
    const deps: ConvertDeps = {
      createImageBitmap: async () => ({ width: 2, height: 2, close: () => undefined }) as unknown as ImageBitmap,
      makeCanvas: () =>
        ({
          getContext: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
          convertToBlob: async () =>
            ({ arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]).buffer }) as Blob,
        }) as unknown as OffscreenCanvas,
    };
    const out = await convertImage(source, 'jpeg', { preserveMetadata: true, deps });
    const back = await extractMetadata(new Blob([out!.bytes as unknown as BlobPart]));
    expect(Array.from(back.exif ?? [])).toEqual(Array.from(exif));
  });

  it('without preserveMetadata, the converted output carries no metadata (strip)', async () => {
    const source = new Blob([
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9]) as unknown as BlobPart,
    ]);
    const deps: ConvertDeps = {
      createImageBitmap: async () => ({ width: 2, height: 2, close: () => undefined }) as unknown as ImageBitmap,
      makeCanvas: () =>
        ({
          getContext: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
          convertToBlob: async () =>
            ({ arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]).buffer }) as Blob,
        }) as unknown as OffscreenCanvas,
    };
    const out = await convertImage(source, 'jpeg', { deps }); // preserve off
    expect(await extractMetadata(new Blob([out!.bytes as unknown as BlobPart]))).toEqual({});
  });
});

describe('isAnimatedImage', () => {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const cc = (s: string) => [...s].map((c) => c.charCodeAt(0));
  // A PNG chunk: 4-byte length + 4-byte type + `dataLen` data bytes + 4-byte CRC.
  const chunk = (type: string, dataLen = 0) => [...u32(dataLen), ...cc(type), ...Array(dataLen).fill(0), ...u32(0)];
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = (...chunks: number[][]) => new Uint8Array([...PNG_SIG, ...chunks.flat()]);

  it('flags an APNG (acTL before IDAT) as animated', () => {
    expect(isAnimatedImage(png(chunk('IHDR', 13), chunk('acTL', 8), chunk('IDAT', 10)))).toBe(true);
  });
  it('treats a static PNG (IDAT, no acTL) as not animated', () => {
    expect(isAnimatedImage(png(chunk('IHDR', 13), chunk('IDAT', 10)))).toBe(false);
  });
  it('still flags an animated WebP (VP8X animation bit set)', () => {
    const webp = new Uint8Array([...cc('RIFF'), ...u32(0), ...cc('WEBP'), ...cc('VP8X'), ...u32(10), 0x02, ...Array(11).fill(0)]);
    expect(isAnimatedImage(webp)).toBe(true);
  });
  it('does not flag a static WebP (VP8X animation bit clear)', () => {
    const webp = new Uint8Array([...cc('RIFF'), ...u32(0), ...cc('WEBP'), ...cc('VP8X'), ...u32(10), 0x00, ...Array(11).fill(0)]);
    expect(isAnimatedImage(webp)).toBe(false);
  });
  it('is safe on a short/empty buffer', () => {
    expect(isAnimatedImage(new Uint8Array([]))).toBe(false);
    expect(isAnimatedImage(new Uint8Array([0x89, 0x50]))).toBe(false);
  });
});
