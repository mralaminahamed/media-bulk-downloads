import { buildMediaSidecar, serializeSidecar, sidecarName } from '@mbd/core/download/metadata-sidecar';
import { ImageInfo } from '@mbd/core/types';

const AT = '2026-07-13T12:00:00.000Z';
const item = (over: Partial<ImageInfo> = {}): ImageInfo =>
  ({ src: 'https://cdn.example.com/photo.jpg', alt: 'A cat', width: 1200, height: 800, type: 'jpeg', ext: 'jpg', fileSize: 54321, isBase64: false, kind: 'image', ...over } as ImageInfo);

describe('buildMediaSidecar', () => {
  it('emits the full documented schema from an item', () => {
    const s = buildMediaSidecar(item({ mediaKey: 'fb:123' }), { url: 'https://site.example/gallery', title: 'Gallery' }, AT);
    expect(s).toEqual({
      src: 'https://cdn.example.com/photo.jpg',
      pageUrl: 'https://site.example/gallery',
      pageTitle: 'Gallery',
      alt: 'A cat',
      kind: 'image',
      format: 'jpg',
      width: 1200,
      height: 800,
      bytes: 54321,
      resolver: 'fb',
      capturedAt: AT,
    });
  });

  it('keeps stable keys with nulls when values are unknown', () => {
    const s = buildMediaSidecar(item({ alt: '', width: 0, height: 0, fileSize: 0, ext: undefined, mediaKey: undefined }), undefined, AT);
    expect(s.pageUrl).toBe('');
    expect(s.pageTitle).toBeNull();
    expect(s.width).toBeNull();
    expect(s.height).toBeNull();
    expect(s.bytes).toBeNull();
    expect(s.resolver).toBeNull();
    // format falls back to the canonical type when no ext.
    expect(s.format).toBe('jpeg');
  });

  it('strips secret query params from src and pageUrl', () => {
    const s = buildMediaSidecar(
      item({ src: 'https://cdn.example.com/photo.jpg?token=SECRET&w=1200' }),
      { url: 'https://site.example/g?auth=PAGE_SECRET' },
      AT,
    );
    expect(s.src).toContain('w=1200');
    expect(s.src).not.toContain('SECRET');
    expect(s.pageUrl).not.toContain('PAGE_SECRET');
  });

  it('takes only the mediaKey prefix as the resolver', () => {
    expect(buildMediaSidecar(item({ mediaKey: 'twitter:abc:def' }), undefined, AT).resolver).toBe('twitter');
    expect(buildMediaSidecar(item({ mediaKey: 'noprefix' }), undefined, AT).resolver).toBeNull();
  });
});

describe('serializeSidecar / sidecarName', () => {
  it('pretty-prints valid JSON with a trailing newline', () => {
    const json = serializeSidecar(buildMediaSidecar(item(), { url: 'https://p' }, AT));
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json).capturedAt).toBe(AT);
    expect(json).toContain('\n  "src":'); // indented
  });

  it('appends .json to the full media filename (keeping any subfolder + extension)', () => {
    expect(sidecarName('photo.jpg')).toBe('photo.jpg.json');
    expect(sidecarName('Media/site/photo.jpg')).toBe('Media/site/photo.jpg.json');
  });
});
