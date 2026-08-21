import { chromeDownloader } from '@/extension/platform/chrome';

afterEach(() => { vi.restoreAllMocks(); });

describe('chromeDownloader', () => {
  it('cancel() forwards the id to chrome.downloads.cancel', () => {
    chromeDownloader.cancel(42);
    expect(chrome.downloads.cancel).toHaveBeenCalledWith(42, expect.any(Function));
  });

  it('download() resolves to the id, or undefined on lastError', async () => {
    (chrome.downloads.download as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_req: unknown, cb: (id?: number) => void) => cb(7),
    );
    expect(await chromeDownloader.download({ url: 'https://x/y.jpg', filename: 'y.jpg' })).toBe(7);
  });
});
