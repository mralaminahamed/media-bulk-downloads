import { buildZip, zipFileName } from '@mbd/core/download/zip';
import { unzipSync } from 'fflate';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';
import { ImageInfo, SettingsData } from '@mbd/core/types';

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

  it('writes a co-located <name>.json sidecar per fetched item when enabled (#284)', async () => {
    const images = [img('https://cdn/a.jpg?token=SECRET', { alt: 'first', width: 800, height: 600 })];
    const fetch = makeFetch({ 'https://cdn/a.jpg?token=SECRET': [1, 2, 3] });
    const settings: SettingsData = { ...DEFAULT_SETTINGS, metadataSidecar: true };

    const { bytes } = await buildZip(images, settings, 'https://site/page', { fetch, capturedAt: '2026-07-13T12:00:00.000Z' });

    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['image_1.jpg', 'image_1.jpg.json']);
    // Media bytes are the fetched ones; the sidecar is valid JSON beside them.
    expect(Array.from(entries['image_1.jpg'])).toEqual([1, 2, 3]);
    const meta = JSON.parse(new TextDecoder().decode(entries['image_1.jpg.json']));
    expect(meta).toMatchObject({ alt: 'first', width: 800, height: 600, pageUrl: 'https://site/page', capturedAt: '2026-07-13T12:00:00.000Z' });
    expect(meta.src).not.toContain('SECRET'); // secret query stripped
  });

  it('caps the archive at maxBytes: items past the ceiling go to `failed` (M7)', async () => {
    const images = [img('https://cdn/a.jpg'), img('https://cdn/b.jpg'), img('https://cdn/c.jpg')];
    const fetch = makeFetch({
      'https://cdn/a.jpg': new Array(100).fill(1),
      'https://cdn/b.jpg': new Array(100).fill(2),
      'https://cdn/c.jpg': new Array(100).fill(3),
    });
    // concurrency 1 → strictly sequential so the byte cap bites deterministically.
    const { bytes, ok, failed, results } = await buildZip(images, DEFAULT_SETTINGS, undefined, {
      fetch,
      concurrency: 1,
      maxBytes: 250,
    });
    expect(ok).toBe(2); // a + b = 200B fit; c would push to 300B > 250 → skipped
    expect(failed.map((f) => f.src)).toEqual(['https://cdn/c.jpg']);
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    // the partial archive still contains the two that fit
    expect(keysOf(bytes)).toEqual(['image_1.jpg', 'image_2.jpg']);
  });

  it('skips an item whose declared content-length exceeds the remaining budget without buffering it', async () => {
    // The oversized item must be routed to `failed` BEFORE arrayBuffer() is
    // called — otherwise the whole body materializes in the page heap regardless
    // of the cap (which is only enforced after buffering).
    const bigArrayBuffer = vi.fn(async () => new Uint8Array(new Array(1000).fill(9)).buffer);
    const fetchStub = (async (input: string) => {
      if (input === 'https://cdn/big.jpg') {
        return { ok: true, headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? '1000' : null) }, arrayBuffer: bigArrayBuffer } as unknown as Response;
      }
      return { ok: true, headers: { get: () => null }, arrayBuffer: async () => new Uint8Array([1, 2]).buffer } as unknown as Response;
    }) as unknown as typeof fetch;

    const images = [img('https://cdn/big.jpg'), img('https://cdn/small.jpg')];
    const { ok, failed } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch: fetchStub, concurrency: 1, maxBytes: 250 });

    expect(failed.map((f) => f.src)).toContain('https://cdn/big.jpg'); // declared 1000 > 250 budget → skipped
    expect(bigArrayBuffer).not.toHaveBeenCalled(); // never buffered the oversized body
    expect(ok).toBe(1); // the small item (no content-length) still fits
  });

  it('writes no sidecar when the setting is off (default)', async () => {
    const images = [img('https://cdn/a.jpg')];
    const fetch = makeFetch({ 'https://cdn/a.jpg': [1] });
    const { bytes } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch });
    expect(keysOf(bytes)).toEqual(['image_1.jpg']);
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

  it('treats an ok response with an empty body as a failure', async () => {
    // res.ok === true but arrayBuffer is 0 bytes → fetchBytes returns null → failed.
    const images = [img('https://cdn/empty.jpg')];
    const fetch = makeFetch({ 'https://cdn/empty.jpg': [] });
    const { bytes, ok, failed } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch });
    expect(ok).toBe(0);
    expect(failed.map((i) => i.src)).toEqual(['https://cdn/empty.jpg']);
    expect(bytes).toHaveLength(0);
  });

  it('uniquifies colliding names that live inside a subfolder (path with a slash)', async () => {
    // original naming + a folder template makes both items resolve to
    // `pics/photo.jpg`, so uniquePath must split the dir off the name.
    const settings: SettingsData = { ...DEFAULT_SETTINGS, namingMode: 'original', downloadPath: 'pics' };
    const images = [img('https://a.com/dir1/photo.jpg'), img('https://b.com/dir2/photo.jpg')];
    const fetch = makeFetch({ 'https://a.com/dir1/photo.jpg': [1], 'https://b.com/dir2/photo.jpg': [2] });
    const { bytes, ok } = await buildZip(images, settings, undefined, { fetch });
    expect(ok).toBe(2);
    expect(keysOf(bytes)).toEqual(['pics/photo (2).jpg', 'pics/photo.jpg']);
  });

  it('uniquifies a three-way name collision, incrementing past (2)', async () => {
    // Three items colliding on the same original name must become photo.jpg,
    // photo (2).jpg, photo (3).jpg — exercising the increment loop beyond (2).
    const settings: SettingsData = { ...DEFAULT_SETTINGS, namingMode: 'original' };
    const images = [
      img('https://a.com/d1/photo.jpg'),
      img('https://b.com/d2/photo.jpg'),
      img('https://c.com/d3/photo.jpg'),
    ];
    const fetch = makeFetch({
      'https://a.com/d1/photo.jpg': [1],
      'https://b.com/d2/photo.jpg': [2],
      'https://c.com/d3/photo.jpg': [3],
    });
    const { bytes, ok } = await buildZip(images, settings, undefined, { fetch });
    expect(ok).toBe(3);
    expect(keysOf(bytes)).toEqual(['photo (2).jpg', 'photo (3).jpg', 'photo.jpg']);
  });

  it('refuses an internal/SSRF target up front and reports it failed — without fetching it', async () => {
    // The popup/bubble fetch holds <all_urls> and bypasses CORS, so a page-controlled
    // media URL aimed at cloud metadata must never reach the network.
    const images = [img('https://cdn/a.jpg'), img('http://169.254.169.254/latest/meta-data/')];
    const fetched: string[] = [];
    const spyFetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetched.push(String(input));
      return { ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer } as Response;
    }) as unknown as typeof fetch;

    const { ok, failed, results } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch: spyFetch });

    expect(ok).toBe(1);
    expect(failed.map((i) => i.src)).toEqual(['http://169.254.169.254/latest/meta-data/']);
    expect(fetched).toEqual(['https://cdn/a.jpg']); // metadata URL never fetched
    expect(results[1]).toMatchObject({ ok: false, path: '' });
  });

  it('rejects a nip.io-style name that embeds an internal IP', async () => {
    const images = [img('http://169.254.169.254.nip.io/x')];
    const fetch = makeFetch({ 'http://169.254.169.254.nip.io/x': [1, 2, 3] }); // would succeed if reached
    const { ok, failed } = await buildZip(images, DEFAULT_SETTINGS, undefined, { fetch });
    expect(ok).toBe(0);
    expect(failed.map((i) => i.src)).toEqual(['http://169.254.169.254.nip.io/x']);
  });

  it('fetches with redirect:"error" so a 30x cannot smuggle the request to an internal host', async () => {
    const inits: Array<RequestInit | undefined> = [];
    const spyFetch = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      inits.push(init);
      return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer } as Response;
    }) as unknown as typeof fetch;
    await buildZip([img('https://cdn/a.jpg')], DEFAULT_SETTINGS, undefined, { fetch: spyFetch });
    expect(inits[0]).toMatchObject({ redirect: 'error' });
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

  it('defaults the date to today (local) when none is passed', () => {
    // Exercises the todayISO() default parameter.
    expect(zipFileName('https://www.twitter.com/x')).toMatch(/^twitter\.com-media-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});
