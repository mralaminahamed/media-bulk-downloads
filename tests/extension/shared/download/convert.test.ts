import { isConvertible, convertImage, ConvertDeps } from '@/extension/shared/download/convert';
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
    const out = await convertImage(new Blob(), 'png', fakeDeps(rec));
    expect(out).toEqual({ bytes: new Uint8Array([1, 2, 3]), ext: 'png', mime: 'image/png' });
    expect(rec.filled).toBeUndefined();
    expect(rec.drawn).toBe(true);
    expect(rec.mime).toBe('image/png');
  });

  it('paints a white background for jpeg (no alpha) and uses a .jpg extension', async () => {
    const rec: Rec = {};
    const out = await convertImage(new Blob(), 'jpeg', fakeDeps(rec));
    expect(out?.ext).toBe('jpg');
    expect(out?.mime).toBe('image/jpeg');
    expect(rec.filled).toBe(true);
  });

  it('returns null when decoding throws', async () => {
    const deps: ConvertDeps = {
      createImageBitmap: async () => { throw new Error('undecodable'); },
      makeCanvas: () => ({}) as unknown as OffscreenCanvas,
    };
    expect(await convertImage(new Blob(), 'png', deps)).toBeNull();
  });
});
