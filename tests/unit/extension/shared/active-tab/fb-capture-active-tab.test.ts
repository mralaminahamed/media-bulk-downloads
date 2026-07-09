import type { Mock } from 'vitest';
import { captureOriginalsActiveTab, abortCaptureOriginalsActiveTab } from '@/extension/shared/active-tab/fb-capture-active-tab';
import { OriginalCaptureProgress } from '@/types';

describe('fb-capture-active-tab — abort targets the driving tab', () => {
  beforeEach(() => {
    (chrome.tabs.query as Mock).mockReset();
    (chrome.tabs.sendMessage as Mock).mockReset();
  });

  // Runs first: before any capture starts there is no recorded tab, so abort
  // falls back to the active tab. (The next test leaves a capture in flight,
  // so ordering matters — module state persists within a file.)
  it('falls back to the active tab when no capture is running, and swallows a lastError on the abort callback', () => {
    (chrome.tabs.query as Mock).mockImplementation((_q, cb) => cb([{ id: 7 }]));
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb());
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'ignored' };

    expect(() => abortCaptureOriginalsActiveTab()).not.toThrow();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'FB_CAPTURE_ABORT', expect.any(Function));

    (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
  });

  it('aborts the tab the capture started in, even after the active tab changes', async () => {
    // Capture starts on tab 5; keep FB_CAPTURE_ORIGINALS in flight (callback never fires).
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 5 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation(() => {});

    void captureOriginalsActiveTab(() => {});
    await new Promise((r) => setTimeout(r, 0)); // let the query resolve + record the tab id

    // User has since switched tabs; abort must still target tab 5, not the query.
    abortCaptureOriginalsActiveTab();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, 'FB_CAPTURE_ABORT', expect.any(Function));
  });
});

describe('captureOriginalsActiveTab — capture lifecycle', () => {
  const query = chrome.tabs.query as Mock;
  const tabsSend = chrome.tabs.sendMessage as Mock;
  const addL = chrome.runtime.onMessage.addListener as Mock;
  const removeL = chrome.runtime.onMessage.removeListener as Mock;

  beforeEach(() => {
    query.mockReset();
    tabsSend.mockReset();
    addL.mockReset();
    removeL.mockReset();
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
  });

  it('throws when there is no active tab', async () => {
    query.mockResolvedValue([]);
    await expect(captureOriginalsActiveTab(vi.fn())).rejects.toThrow(/No active tab/);
  });

  it('sends FB_CAPTURE_ORIGINALS to the active tab and resolves its media', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    tabsSend.mockImplementation((_id, _msg, cb) => cb([{ src: 'a' }]));
    const media = await captureOriginalsActiveTab(() => {});
    expect(tabsSend).toHaveBeenCalledWith(7, 'FB_CAPTURE_ORIGINALS', expect.any(Function));
    expect(media).toEqual([{ src: 'a' }]);
  });

  it("resolves the collected media and relays only the driving tab's progress", async () => {
    query.mockResolvedValue([{ id: 7 }]);
    let done!: (media: unknown) => void;
    tabsSend.mockImplementation((_id, _msg, cb) => { done = cb; });
    const onProgress = vi.fn();

    const p = captureOriginalsActiveTab(onProgress);
    await Promise.resolve(); // let `await chrome.tabs.query` settle + the listener register
    const listener = addL.mock.calls.at(-1)![0];

    listener({ type: 'FB_CAPTURE_PROGRESS', opened: 9, captured: 9, total: 9 } as unknown as OriginalCaptureProgress, { tab: { id: 8 } }); // other tab → ignored
    listener({ type: 'SOMETHING' }, { tab: { id: 7 } }); // non-progress → ignored
    expect(onProgress).not.toHaveBeenCalled();
    listener({ type: 'FB_CAPTURE_PROGRESS', opened: 1, captured: 1, total: 3 } as unknown as OriginalCaptureProgress, { tab: { id: 7 } });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ opened: 1 }));

    done([{ src: 'https://x/a.jpg' }]);
    await expect(p).resolves.toEqual([{ src: 'https://x/a.jpg' }]);
    expect(removeL).toHaveBeenCalledWith(listener); // cleaned up in finally
  });

  it('normalizes a non-array response to an empty array', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(captureOriginalsActiveTab(vi.fn())).resolves.toEqual([]);
  });

  it('rejects and cleans up when the content script lastErrors', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'no content script' };
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(captureOriginalsActiveTab(vi.fn())).rejects.toThrow(/no content script/);
    expect(removeL).toHaveBeenCalled();
  });

  it('rejects with a fallback message when chrome.runtime.lastError has no message', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = {};
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(captureOriginalsActiveTab(vi.fn())).rejects.toThrow('capture failed');
  });

  it("does not clear a newer overlapping capture's active tab id when an older capture finishes first", async () => {
    // Capture A starts on tab 7 and is held open (its callback never fires yet).
    query.mockResolvedValueOnce([{ id: 7 }]);
    let doneA!: (media: unknown) => void;
    tabsSend.mockImplementationOnce((_id, _msg, cb) => { doneA = cb; });
    const captureA = captureOriginalsActiveTab(vi.fn());
    await Promise.resolve(); // let A's query settle: activeCaptureTabId = 7

    // Capture B starts on tab 9 before A finishes — overwrites the module's active-capture tab id.
    query.mockResolvedValueOnce([{ id: 9 }]);
    let doneB!: (media: unknown) => void;
    tabsSend.mockImplementationOnce((_id, _msg, cb) => { doneB = cb; });
    const captureB = captureOriginalsActiveTab(vi.fn());
    await Promise.resolve(); // let B's query settle: activeCaptureTabId = 9

    // A finishes. Its finally block must see activeCaptureTabId(9) !== its own tabId(7)
    // and must NOT null it out — otherwise an abort issued now would silently no-op
    // instead of reaching B's tab.
    doneA([]);
    await captureA;

    query.mockReset();
    tabsSend.mockReset();
    tabsSend.mockImplementation((_id, _msg, cb) => cb()); // actually invoke the abort callback
    abortCaptureOriginalsActiveTab();
    expect(tabsSend).toHaveBeenCalledWith(9, 'FB_CAPTURE_ABORT', expect.any(Function));
    expect(query).not.toHaveBeenCalled(); // targeted B directly, no active-tab fallback needed

    // Let B settle too so activeCaptureTabId is clean (null) for later tests.
    doneB([]);
    await captureB;
  });

  it('fallback abort (no capture running) is a no-op when there is also no active tab', () => {
    // At this point activeCaptureTabId is null (the previous test's capture B resolved
    // and reset it), so abort falls through to the chrome.tabs.query callback path.
    query.mockImplementation((_q, cb) => cb([]));
    tabsSend.mockReset();
    abortCaptureOriginalsActiveTab();
    expect(tabsSend).not.toHaveBeenCalled();
  });
});
