import type { Mock } from 'vitest';

// The FB original-capture runner drives real DOM scrolling/clicking; the
// content script only wires its lifecycle (start / abort / respond / stream
// progress), so stub the runner itself — mirrors deepScanRunner mocking in
// content.test.ts's "Deep scan message handling" block.
vi.mock('@/extension/content/originalCaptureRunner', () => ({
  startOriginalCapture: vi.fn(),
}));

// ── FB capture-originals lifecycle message handling ─────────────────────────
// index.ts registers a third runtime.onMessage listener (after GET_IMAGES and
// DEEP_SCAN) that starts/aborts the original-capture run and streams progress
// back through chrome.runtime.sendMessage. Re-import fresh and grab that
// listener each time — same pattern as the sibling Deep scan suite.
describe('FB capture-originals message handling', () => {
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  interface Wired {
    handler: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
    startOriginalCapture: Mock;
  }

  const wire = async (): Promise<Wired> => {
    vi.resetModules();
    const startOriginalCapture = (await import('@/extension/content/originalCaptureRunner'))
      .startOriginalCapture as unknown as Mock;
    startOriginalCapture.mockReset();
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_keys: unknown, cb: (r: { settings: unknown }) => void) => cb({ settings: {} }),
    );
    const addListener = chrome.runtime.onMessage.addListener as Mock;
    addListener.mockClear();

    await import('@/extension/content');

    // index.ts registers GET_IMAGES first, DEEP_SCAN second, and the FB capture
    // lifecycle listener third.
    const handler = addListener.mock.calls[2][0] as Wired['handler'];
    return { handler, startOriginalCapture };
  };

  afterEach(() => {
    (chrome.storage.sync.get as Mock).mockReset();
  });

  afterAll(() => {
    (chrome.runtime.onMessage.addListener as Mock).mockClear();
    vi.resetModules();
  });

  it('starts capture and responds with the collected media', async () => {
    const { handler, startOriginalCapture } = await wire();
    const media = [{ src: 'https://x.fbcdn.net/o_n.jpg' }];
    startOriginalCapture.mockResolvedValue(media);

    const sendResponse = vi.fn();
    const ret = handler('FB_CAPTURE_ORIGINALS', {}, sendResponse);
    expect(ret).toBe(true); // keeps the message channel open for the async reply
    await flush();

    expect(startOriginalCapture).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(media);
  });

  it('responds with an empty list when the capture run rejects', async () => {
    const { handler, startOriginalCapture } = await wire();
    startOriginalCapture.mockRejectedValue(new Error('boom'));

    const sendResponse = vi.fn();
    handler('FB_CAPTURE_ORIGINALS', {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith([]);
  });

  it('reads fbCaptureMaxPhotos / fbCaptureMaxSeconds from settings, converting seconds to ms', async () => {
    const { handler, startOriginalCapture } = await wire();
    (chrome.storage.sync.get as Mock).mockImplementation(
      (_keys: unknown, cb: (r: { settings: unknown }) => void) =>
        cb({ settings: { fbCaptureMaxPhotos: 60, fbCaptureMaxSeconds: 180 } }),
    );
    startOriginalCapture.mockResolvedValue([]);

    handler('FB_CAPTURE_ORIGINALS', {}, vi.fn());
    await flush();

    expect(startOriginalCapture).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
      { maxPhotos: 60, maxMs: 180000 },
    );
  });

  it('streams progress to the popup, including the stop reason', async () => {
    const { handler, startOriginalCapture } = await wire();
    (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue(undefined);
    // The runner reports progress via the onProgress callback the content
    // script supplies; that callback forwards an FB_CAPTURE_PROGRESS message.
    startOriginalCapture.mockImplementation(
      (onProgress: (opened: number, captured: number, total: number, reason?: string) => void) => {
        onProgress(12, 10, 12, 'complete');
        return Promise.resolve([]);
      },
    );

    handler('FB_CAPTURE_ORIGINALS', {}, vi.fn());
    await flush();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'FB_CAPTURE_PROGRESS', opened: 12, captured: 10, total: 12, reason: 'complete',
    });
  });

  it('omits the reason field from an interim progress message', async () => {
    const { handler, startOriginalCapture } = await wire();
    (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue(undefined);
    startOriginalCapture.mockImplementation(
      (onProgress: (opened: number, captured: number, total: number, reason?: string) => void) => {
        onProgress(3, 2, 12); // no stop reason yet
        return Promise.resolve([]);
      },
    );

    handler('FB_CAPTURE_ORIGINALS', {}, vi.fn());
    await flush();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'FB_CAPTURE_PROGRESS', opened: 3, captured: 2, total: 12,
    });
  });

  it('acknowledges FB_CAPTURE_ABORT synchronously', async () => {
    const { handler } = await wire();
    const sendResponse = vi.fn();
    const ret = handler('FB_CAPTURE_ABORT', {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(true);
    expect(ret).toBeUndefined(); // synchronous — channel not held open
  });

  it('ignores unrelated messages on the capture listener', async () => {
    const { handler, startOriginalCapture } = await wire();
    const sendResponse = vi.fn();
    const ret = handler('SOMETHING_ELSE', {}, sendResponse);
    expect(ret).toBeUndefined();
    expect(startOriginalCapture).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
