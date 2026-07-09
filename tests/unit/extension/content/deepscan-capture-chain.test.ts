/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/" }
 *
 * A deep scan on a Facebook photo grid should, when the user has opted into
 * `fbCaptureOriginals`, chain an original-capture pass over the tiles the scan
 * already loaded (no re-scroll) and then re-collect so the resolver upgrades
 * every tile to its stored original before the popup gets a response.
 *
 * `shouldChainCapture` is the pure, host+settings gate that decides whether to
 * chain — it's unit-tested directly below with no module wiring involved. The
 * second describe block exercises the actual DEEP_SCAN listener wiring; this
 * file pins jsdom's location to facebook.com (immutable at runtime, so fixed
 * per file via `@vitest-environment-options`, same as relay-fb.test.ts) so the
 * on/off cases below only vary the `fbCaptureOriginals` flag. Host gating
 * itself (FB vs non-FB) is covered by the shouldChainCapture unit tests, which
 * take `host` as a plain string argument and need no location stubbing.
 */
import type { Mock } from 'vitest';

vi.mock('@/extension/content/deepScanRunner', () => ({ startDeepScan: vi.fn() }));
vi.mock('@/extension/content/originalCaptureRunner', () => ({
  startOriginalCapture: vi.fn(),
  runCaptureOnLoadedTiles: vi.fn(),
}));
vi.mock('@/extension/content/collect', async () => ({
  ...(await vi.importActual<typeof import('@/extension/content/collect')>('@/extension/content/collect')),
  collectMedia: vi.fn(),
}));

import { shouldChainCapture } from '@/extension/content';
import { withDefaults } from '@/extension/shared/storage/settings';

describe('shouldChainCapture (pure gate)', () => {
  it('is true on a bare facebook.com host with the flag on', () => {
    expect(shouldChainCapture('facebook.com', withDefaults({ fbCaptureOriginals: true }))).toBe(true);
  });

  it('is false on a facebook.com host with the flag off', () => {
    expect(shouldChainCapture('facebook.com', withDefaults({ fbCaptureOriginals: false }))).toBe(false);
  });

  it('is false on a non-Facebook host even with the flag on', () => {
    expect(shouldChainCapture('example.com', withDefaults({ fbCaptureOriginals: true }))).toBe(false);
  });

  it('is false on a non-Facebook host with the flag off', () => {
    expect(shouldChainCapture('example.com', withDefaults({ fbCaptureOriginals: false }))).toBe(false);
  });

  it('matches Facebook subdomains (e.g. www.facebook.com)', () => {
    expect(shouldChainCapture('www.facebook.com', withDefaults({ fbCaptureOriginals: true }))).toBe(true);
  });
});

// ── DEEP_SCAN → capture chaining (wiring) ───────────────────────────────────
// index.ts registers GET_IMAGES first, then the deep-scan listener second —
// same ordering the sibling "Deep scan message handling" suite in
// content.test.ts relies on. Re-import fresh and grab that listener each time.
describe('deep-scan -> capture chaining wiring', () => {
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  interface Wired {
    handler: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
    startDeepScan: Mock;
    runCaptureOnLoadedTiles: Mock;
    collectMedia: Mock;
  }

  const wire = async (settings: unknown): Promise<Wired> => {
    vi.resetModules();
    const startDeepScan = (await import('@/extension/content/deepScanRunner')).startDeepScan as unknown as Mock;
    startDeepScan.mockReset();
    const runCaptureOnLoadedTiles = (await import('@/extension/content/originalCaptureRunner'))
      .runCaptureOnLoadedTiles as unknown as Mock;
    runCaptureOnLoadedTiles.mockReset();
    const collectMedia = (await import('@/extension/content/collect')).collectMedia as unknown as Mock;
    collectMedia.mockReset();
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_keys: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings }),
    );
    const addListener = chrome.runtime.onMessage.addListener as Mock;
    addListener.mockClear();

    await import('@/extension/content');

    // index.ts registers GET_IMAGES first, then the deep-scan listener second.
    const handler = addListener.mock.calls[1][0] as Wired['handler'];
    return { handler, startDeepScan, runCaptureOnLoadedTiles, collectMedia };
  };

  afterEach(() => {
    (chrome.storage.sync.get as Mock).mockReset();
  });

  afterAll(() => {
    (chrome.runtime.onMessage.addListener as Mock).mockClear();
    vi.resetModules();
  });

  it('chains capture over the loaded tiles and responds with the re-collected media on a FB grid with the flag on', async () => {
    const { handler, startDeepScan, runCaptureOnLoadedTiles, collectMedia } = await wire({
      fbCaptureOriginals: true,
      deepScanMaxItems: 1000,
      deepScanMaxSeconds: 20,
      deepScanMaxScrolls: 40,
      fbCaptureMaxPhotos: 60,
      fbCaptureMaxSeconds: 180,
    });
    const deepScanMedia = [{ src: 'https://x.fbcdn.net/scan.jpg' }];
    const recollected = [{ src: 'https://x.fbcdn.net/scan_o.jpg' }];
    startDeepScan.mockResolvedValue(deepScanMedia);
    runCaptureOnLoadedTiles.mockResolvedValue({ opened: 1, captured: 1, skipped: 0, stoppedBy: 'complete' });
    collectMedia.mockReturnValue(recollected);

    const sendResponse = vi.fn();
    const ret = handler('DEEP_SCAN', {}, sendResponse);
    expect(ret).toBe(true); // keeps the message channel open for the async reply
    await flush();

    expect(startDeepScan).toHaveBeenCalled();
    expect(runCaptureOnLoadedTiles).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
      { maxPhotos: 60, maxMs: 180000 },
    );
    // The response is the re-collected media (post-capture), not the raw deep-scan result.
    expect(sendResponse).toHaveBeenCalledWith(recollected);
  });

  it('does not chain capture when fbCaptureOriginals is off, even on a FB grid', async () => {
    const { handler, startDeepScan, runCaptureOnLoadedTiles } = await wire({ fbCaptureOriginals: false });
    const deepScanMedia = [{ src: 'https://x.fbcdn.net/scan.jpg' }];
    startDeepScan.mockResolvedValue(deepScanMedia);

    const sendResponse = vi.fn();
    handler('DEEP_SCAN', {}, sendResponse);
    await flush();

    expect(runCaptureOnLoadedTiles).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(deepScanMedia);
  });
});
