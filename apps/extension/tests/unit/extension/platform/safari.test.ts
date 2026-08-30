/** @vitest-environment jsdom */
import {
  safariDownloader, safariNotifier, safariHeaderRules, __resetSafariDownloadsForTest,
} from '@/extension/platform/safari';

const stubAnchorClick = (): { clicked: string[]; restore: () => void } => {
  const clicked: string[] = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this.download); };
  return { clicked, restore: () => { HTMLAnchorElement.prototype.click = orig; } };
};

beforeEach(() => {
  __resetSafariDownloadsForTest();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('safariDownloader (anchor-blob)', () => {
  it('fetches an http(s) url to a blob and clicks an <a download>, dropping subdirs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['x']), { status: 200 }));
    const a = stubAnchorClick();

    const id = await safariDownloader.download({ url: 'https://cdn/x.jpg', filename: 'sub/dir/photo.jpg' });

    expect(typeof id).toBe('number');
    expect(a.clicked).toEqual(['photo.jpg']);
    a.restore();
  });

  it('hands out a distinct id per download', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Blob(['x']), { status: 200 }));
    const a = stubAnchorClick();

    const first = await safariDownloader.download({ url: 'https://cdn/a.jpg', filename: 'a.jpg' });
    const second = await safariDownloader.download({ url: 'https://cdn/b.jpg', filename: 'b.jpg' });

    expect(first).not.toBe(second);
    a.restore();
  });

  it('search({id}) returns the completed record so the queue can settle it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['xyz']), { status: 200 }));
    const a = stubAnchorClick();

    const id = await safariDownloader.download({ url: 'https://cdn/x.jpg', filename: 'x.jpg' });
    const [rec] = await safariDownloader.search({ id: id as number });

    expect(rec).toMatchObject({ id, url: 'https://cdn/x.jpg', filename: 'x.jpg', state: 'complete' });
    expect(rec.exists).toBeUndefined();
    a.restore();
  });

  it('notifies onChanged listeners with a terminal state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['x']), { status: 200 }));
    const a = stubAnchorClick();
    const seen: { id: number; state?: string }[] = [];
    safariDownloader.onChanged((c) => seen.push(c));

    const id = await safariDownloader.download({ url: 'https://cdn/x.jpg', filename: 'x.jpg' });

    expect(seen).toEqual([{ id, state: 'complete' }]);
    a.restore();
  });

  it('returns undefined on a failed fetch and records nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    expect(await safariDownloader.download({ url: 'https://cdn/x.jpg', filename: 'x.jpg' })).toBeUndefined();
    expect(await safariDownloader.search({ limit: 0 })).toEqual([]);
  });

  it('caps the in-memory registry so a long session cannot grow it without bound', async () => {
    // A Response body can only be read once — hand each call a fresh one.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Blob(['x']), { status: 200 }));
    const a = stubAnchorClick();

    for (let i = 0; i < 205; i++) {
      await safariDownloader.download({ url: `https://cdn/${i}.jpg`, filename: `${i}.jpg` });
    }
    const all = await safariDownloader.search({ limit: 0 });

    expect(all).toHaveLength(200);
    expect(all[all.length - 1].filename).toBe('204.jpg');
    a.restore();
  });

  it('open/show/cancel stay no-ops (no downloads API)', () => {
    expect(() => { safariDownloader.open(1); safariDownloader.show(1); safariDownloader.cancel(1); }).not.toThrow();
  });
});

describe('safari capability flags', () => {
  it('notifier + header rules report unavailable', () => {
    expect(safariNotifier.available).toBe(false);
    expect(safariHeaderRules.available).toBe(false);
  });
});
