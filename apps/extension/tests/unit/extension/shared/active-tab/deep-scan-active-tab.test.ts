import type { Mock } from 'vitest';
import { deepScanActiveTab, abortDeepScanActiveTab } from '@/extension/shared/active-tab/deep-scan-active-tab';
import { DeepScanProgress } from '@mbd/core/types';

describe('deep-scan-active-tab — abort targets the scanning tab', () => {
  beforeEach(() => {
    (chrome.tabs.query as Mock).mockReset();
    (chrome.tabs.sendMessage as Mock).mockReset();
  });

  it('falls back to the active tab when no scan is running, and swallows a lastError on the abort callback', () => {
    (chrome.tabs.query as Mock).mockImplementation((_q, cb) => cb([{ id: 7 }]));
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb());
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'ignored' };

    expect(() => abortDeepScanActiveTab()).not.toThrow();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'DEEP_SCAN_ABORT', expect.any(Function));

    (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
  });

  it('aborts the tab the scan started in, even after the active tab changes', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 5 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation(() => {});

    void deepScanActiveTab(() => {});
    await new Promise((r) => setTimeout(r, 0));

    abortDeepScanActiveTab();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, 'DEEP_SCAN_ABORT', expect.any(Function));
  });
});

describe('deepScanActiveTab — scan lifecycle', () => {
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
    await expect(deepScanActiveTab(vi.fn())).rejects.toThrow(/No active tab/);
  });

  it('resolves the collected media and relays only this tab\'s progress', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    let done!: (media: unknown) => void;
    tabsSend.mockImplementation((_id, _msg, cb) => { done = cb; });
    const onProgress = vi.fn();

    const p = deepScanActiveTab(onProgress);
    await Promise.resolve();
    const listener = addL.mock.calls.at(-1)![0];

    listener({ type: 'DEEP_SCAN_PROGRESS', found: 1 } as unknown as DeepScanProgress, { tab: { id: 99 } });
    listener({ type: 'SOMETHING' }, { tab: { id: 7 } });
    expect(onProgress).not.toHaveBeenCalled();
    listener({ type: 'DEEP_SCAN_PROGRESS', found: 3 } as unknown as DeepScanProgress, { tab: { id: 7 } });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ found: 3 }));

    done([{ src: 'https://x/a.jpg' }]);
    await expect(p).resolves.toEqual([{ src: 'https://x/a.jpg' }]);
    expect(removeL).toHaveBeenCalledWith(listener);
  });

  it('normalizes a non-array response to an empty array', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(deepScanActiveTab(vi.fn())).resolves.toEqual([]);
  });

  it('rejects and cleans up when the content script lastErrors', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'no content script' };
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(deepScanActiveTab(vi.fn())).rejects.toThrow(/no content script/);
    expect(removeL).toHaveBeenCalled();
  });

  it('rejects with a fallback message when chrome.runtime.lastError has no message', async () => {
    query.mockResolvedValue([{ id: 7 }]);
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = {};
    tabsSend.mockImplementation((_id, _msg, cb) => cb(undefined));
    await expect(deepScanActiveTab(vi.fn())).rejects.toThrow('deep scan failed');
  });

  it("does not clear a newer overlapping scan's active tab id when an older scan finishes first", async () => {
    query.mockResolvedValueOnce([{ id: 7 }]);
    let doneA!: (media: unknown) => void;
    tabsSend.mockImplementationOnce((_id, _msg, cb) => { doneA = cb; });
    const scanA = deepScanActiveTab(vi.fn());
    await Promise.resolve();

    query.mockResolvedValueOnce([{ id: 9 }]);
    let doneB!: (media: unknown) => void;
    tabsSend.mockImplementationOnce((_id, _msg, cb) => { doneB = cb; });
    const scanB = deepScanActiveTab(vi.fn());
    await Promise.resolve();

    doneA([]);
    await scanA;

    query.mockReset();
    tabsSend.mockReset();
    tabsSend.mockImplementation((_id, _msg, cb) => cb());
    abortDeepScanActiveTab();
    expect(tabsSend).toHaveBeenCalledWith(9, 'DEEP_SCAN_ABORT', expect.any(Function));
    expect(query).not.toHaveBeenCalled();

    doneB([]);
    await scanB;
  });

  it('fallback abort (no scan running) is a no-op when there is also no active tab', () => {
    query.mockImplementation((_q, cb) => cb([]));
    tabsSend.mockReset();
    abortDeepScanActiveTab();
    expect(tabsSend).not.toHaveBeenCalled();
  });
});
