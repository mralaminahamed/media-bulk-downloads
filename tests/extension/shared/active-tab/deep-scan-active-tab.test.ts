import { deepScanActiveTab, abortDeepScanActiveTab } from '@/extension/shared/active-tab/deep-scan-active-tab';
import { DeepScanProgress } from '@/types';

describe('deep-scan-active-tab — abort targets the scanning tab', () => {
  beforeEach(() => {
    (chrome.tabs.query as jest.Mock).mockReset();
    (chrome.tabs.sendMessage as jest.Mock).mockReset();
  });

  // Runs first: before any scan starts there is no recorded tab, so abort falls
  // back to the active tab. (The next test leaves a scan in flight, so ordering
  // matters — module state persists within a file.)
  it('falls back to the active tab when no scan is running', () => {
    (chrome.tabs.query as jest.Mock).mockImplementation((_q, cb) => cb([{ id: 7 }]));
    abortDeepScanActiveTab();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'DEEP_SCAN_ABORT', expect.any(Function));
  });

  it('aborts the tab the scan started in, even after the active tab changes', async () => {
    // Scan starts on tab 5; keep DEEP_SCAN in flight (callback never fires).
    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ id: 5 }]);
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation(() => {});

    void deepScanActiveTab(() => {});
    await new Promise((r) => setTimeout(r, 0)); // let the query resolve + record the tab id

    // User has since switched tabs; abort must still target tab 5, not the query.
    abortDeepScanActiveTab();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, 'DEEP_SCAN_ABORT', expect.any(Function));
  });
});

describe('deepScanActiveTab — scan lifecycle', () => {
  const query = chrome.tabs.query as jest.Mock;
  const tabsSend = chrome.tabs.sendMessage as jest.Mock;
  const addL = chrome.runtime.onMessage.addListener as jest.Mock;
  const removeL = chrome.runtime.onMessage.removeListener as jest.Mock;

  beforeEach(() => {
    query.mockReset();
    tabsSend.mockReset();
    addL.mockReset();
    removeL.mockReset();
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
  });

  it('throws when there is no active tab', async () => {
    query.mockResolvedValue([]);
    await expect(deepScanActiveTab(jest.fn())).rejects.toThrow(/No active tab/);
  });

  it('resolves the collected media and relays only this tab\'s progress', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    let done!: (media: unknown) => void;
    tabsSend.mockImplementation((_id, _msg, cb) => { done = cb; });
    const onProgress = jest.fn();

    const p = deepScanActiveTab(onProgress);
    await Promise.resolve(); // let `await chrome.tabs.query` settle + the listener register
    const listener = addL.mock.calls.at(-1)![0];

    listener({ type: 'DEEP_SCAN_PROGRESS', found: 1 } as unknown as DeepScanProgress, { tab: { id: 99 } }); // other tab → ignored
    listener({ type: 'SOMETHING' }, { tab: { id: 7 } }); // non-progress → ignored
    expect(onProgress).not.toHaveBeenCalled();
    listener({ type: 'DEEP_SCAN_PROGRESS', found: 3 } as unknown as DeepScanProgress, { tab: { id: 7 } });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ found: 3 }));

    done([{ src: 'https://x/a.jpg' }]);
    await expect(p).resolves.toEqual([{ src: 'https://x/a.jpg' }]);
    expect(removeL).toHaveBeenCalledWith(listener); // cleaned up in finally
  });

  it('normalizes a non-array response to an empty array', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(deepScanActiveTab(jest.fn())).resolves.toEqual([]);
  });

  it('rejects and cleans up when the content script lastErrors', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'no content script' };
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(deepScanActiveTab(jest.fn())).rejects.toThrow(/no content script/);
    expect(removeL).toHaveBeenCalled();
  });
});
