import { deepScanActiveTab, abortDeepScanActiveTab } from '@/extension/shared/active-tab/deep-scan-active-tab';

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
