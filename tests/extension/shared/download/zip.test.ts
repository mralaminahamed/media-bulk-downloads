import { buildZip, zipFileName } from '@/extension/shared/download/zip';
import { unzipSync } from 'fflate';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { ImageInfo, SettingsData } from '@/types';

const img = (src: string, extra: Partial<ImageInfo> = {}): ImageInfo =>
  ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...extra });

/** A fetch stub mapping url → bytes | 'fail' (non-ok) | 'throw' (network error). */
type FetchTable = Record<string, number[] | 'fail' | 'throw'>;
const makeFetch = (table: FetchTable): typeof fetch =>
  (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input); // buildZip always calls fetch with a string URL
    const v = table[url];
    if (v === 'throw') throw new Error('network');
    if (v === undefined || v === 'fail') {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array(v).buffer } as Response;
  }) as unknown as typeof fetch;

const keysOf = (bytes: Uint8Array): string[] => Object.keys(unzipSync(bytes)).sort();

describe('buildZip', () => {
  it('fetches each item and stores it under its download filename', async () => {
    const images = [img('https://cdn/a.jpg'), img('https://cdn/b.jpg')];
    const fetch = makeFetch({ 'https://cdn/a.jpg': [1, 2, 3], 'https://cdn/b.jpg': [4, 5] });

    const { bytes, ok, failed, results } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch });

    expect(ok).toBe(2);
    expect(failed).toEqual([]);
    const entries = unzipSync(bytes);
    // Default settings: prefix "image_", 1-indexed, jpeg extension, no subfolder.
    expect(Object.keys(entries).sort()).toEqual(['image_1.jpg', 'image_2.jpg']);
    expect(Array.from(entries['image_1.jpg'])).toEqual([1, 2, 3]);
    expect(Array.from(entries['image_2.jpg'])).toEqual([4, 5]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('skips a fetch failure, keeps it in `failed`, and still zips the rest', async () => {
    const images = [img('https://cdn/a.jpg'), img('https://cdn/bad.jpg'), img('https://cdn/c.jpg')];
    const fetch = makeFetch({ 'https://cdn/a.jpg': [1], 'https://cdn/bad.jpg': 'fail', 'https://cdn/c.jpg': [2] });

    const { bytes, ok, failed } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch });

    expect(ok).toBe(2);
    expect(failed.map((i) => i.src)).toEqual(['https://cdn/bad.jpg']);
    // The failed item's slot name is not in the archive; the others are.
    expect(keysOf(bytes)).toEqual(['image_1.jpg', 'image_3.jpg']);
  });

  it('treats a thrown fetch the same as a failure', async () => {
    const images = [img('https://cdn/x.jpg')];
    const fetch = makeFetch({ 'https://cdn/x.jpg': 'throw' });
    const { bytes, ok, failed } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch });
    expect(ok).toBe(0);
    expect(failed).toHaveLength(1);
    expect(bytes).toHaveLength(0); // nothing fetched → empty archive
  });

  it('applies the folder template inside the archive', async () => {
    const settings: SettingsData = { ...DEFAULT_SETTINGS, downloadPath: '{domain}/{date}' };
    const images = [img('https://cdn/a.jpg')];
    const fetch = makeFetch({ 'https://cdn/a.jpg': [1] });
    const { bytes } = await buildZip(images, settings, 'https://www.example.com/page', { fetch });
    const [path] = keysOf(bytes);
    expect(path).toMatch(/^example\.com\/\d{4}-\d{2}-\d{2}\/image_1\.jpg$/);
  });

  it('uniquifies colliding names in original-naming mode', async () => {
    const settings: SettingsData = { ...DEFAULT_SETTINGS, namingMode: 'original' };
    const images = [img('https://a.com/dir1/photo.jpg'), img('https://b.com/dir2/photo.jpg')];
    const fetch = makeFetch({ 'https://a.com/dir1/photo.jpg': [1], 'https://b.com/dir2/photo.jpg': [2] });
    const { bytes, ok } = await buildZip(images, settings, undefined, { fetch });
    expect(ok).toBe(2);
    expect(keysOf(bytes)).toEqual(['photo (2).jpg', 'photo.jpg']);
  });

  it('reports progress once per item', async () => {
    const images = [img('https://cdn/a.jpg'), img('https://cdn/b.jpg')];
    const fetch = makeFetch({ 'https://cdn/a.jpg': [1], 'https://cdn/b.jpg': [2] });
    const seen: Array<[number, number]> = [];
    await buildZip(images, DEFAULT_SETTINGS, undefined, {
      fetch,
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toHaveLength(2);
    expect(seen[seen.length - 1]).toEqual([2, 2]);
  });
});

describe('zipFileName', () => {
  it('names the archive by registrable domain + date', () => {
    expect(zipFileName('https://www.twitter.com/x', '2026-07-06')).toBe('twitter.com-media-2026-07-06.zip');
  });

  it('falls back to a generic name when the source host is unknown', () => {
    expect(zipFileName(undefined, '2026-07-06')).toBe('media-2026-07-06.zip');
  });
});
