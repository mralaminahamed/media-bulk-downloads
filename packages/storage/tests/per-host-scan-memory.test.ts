import {
  loadScanMemory, loadScanMemoryForHost, saveScanMemoryForHost, clearScanMemoryForHost,
  PER_HOST_SCAN_MEMORY_KEY,
} from '@mbd/storage/per-host-scan-memory';

describe('scan-memory storage', () => {
  beforeEach(() => {
    return clearScanMemoryForHost('example.com').then(() =>
      (chrome.storage.local.set as unknown as (o: Record<string, unknown>) => Promise<void>)(
        { [PER_HOST_SCAN_MEMORY_KEY]: {} },
      ),
    );
  });

  it('saves then loads a host, stamping updatedAt from now', async () => {
    await saveScanMemoryForHost('example.com', { settleMs: 800, scrolls: 20 }, 4242);
    expect(await loadScanMemoryForHost('example.com'))
      .toEqual({ settleMs: 800, scrolls: 20, updatedAt: 4242 });
  });

  it('cross-visit blends on the second save', async () => {
    await saveScanMemoryForHost('example.com', { settleMs: 400, scrolls: 10 }, 1);
    await saveScanMemoryForHost('example.com', { settleMs: 900, scrolls: 25 }, 2);
    expect(await loadScanMemoryForHost('example.com'))
      .toEqual({ settleMs: 650, scrolls: 18, updatedAt: 2 });
  });

  it('loadScanMemoryForHost returns null for an absent host / empty host', async () => {
    expect(await loadScanMemoryForHost('nope.com')).toBeNull();
    expect(await loadScanMemoryForHost('')).toBeNull();
  });

  it('saveScanMemoryForHost is a no-op for an empty host', async () => {
    await saveScanMemoryForHost('', { settleMs: 1, scrolls: 1 }, 1);
    expect(await loadScanMemory()).toEqual({});
  });

  it('clearScanMemoryForHost removes a host', async () => {
    await saveScanMemoryForHost('example.com', { settleMs: 1, scrolls: 1 }, 1);
    await clearScanMemoryForHost('example.com');
    expect(await loadScanMemoryForHost('example.com')).toBeNull();
  });

  it('load drops a corrupt stored entry', async () => {
    await (chrome.storage.local.set as unknown as (o: Record<string, unknown>) => Promise<void>)({
      [PER_HOST_SCAN_MEMORY_KEY]: { 'bad.com': { settleMs: 'x', scrolls: 1 }, 'ok.com': { settleMs: 5, scrolls: 5, updatedAt: 5 } },
    });
    const store = await loadScanMemory();
    expect(store['bad.com']).toBeUndefined();
    expect(store['ok.com']).toEqual({ settleMs: 5, scrolls: 5, updatedAt: 5 });
  });
});
