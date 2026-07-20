import {
  clampMemory, blendMemory, evictToCap,
  SCAN_MEMORY_SETTLE_MAX, SCAN_MEMORY_SCROLLS_MAX, SCAN_MEMORY_MAX_HOSTS,
} from '@mbd/storage/per-host-scan-memory';
import {
  loadScanMemory, loadScanMemoryForHost, saveScanMemoryForHost, clearScanMemoryForHost,
  PER_HOST_SCAN_MEMORY_KEY,
} from '@mbd/storage/per-host-scan-memory';

describe('clampMemory', () => {
  it('accepts a valid entry, carrying updatedAt through', () => {
    expect(clampMemory({ settleMs: 500, scrolls: 12, updatedAt: 99 }))
      .toEqual({ settleMs: 500, scrolls: 12, updatedAt: 99 });
  });
  it('defaults a missing/insane updatedAt to 0', () => {
    expect(clampMemory({ settleMs: 500, scrolls: 12 })?.updatedAt).toBe(0);
    expect(clampMemory({ settleMs: 500, scrolls: 12, updatedAt: NaN })?.updatedAt).toBe(0);
  });
  it('rejects NaN / negative / non-object as null', () => {
    expect(clampMemory({ settleMs: NaN, scrolls: 1 })).toBeNull();
    expect(clampMemory({ settleMs: 1, scrolls: -3 })).toBeNull();
    expect(clampMemory(null)).toBeNull();
    expect(clampMemory('nope')).toBeNull();
    expect(clampMemory({ settleMs: 1 })).toBeNull();
  });
  it('clamps over-max values to the bounds', () => {
    const m = clampMemory({ settleMs: 999999, scrolls: 99999, updatedAt: 1 });
    expect(m).toEqual({ settleMs: SCAN_MEMORY_SETTLE_MAX, scrolls: SCAN_MEMORY_SCROLLS_MAX, updatedAt: 1 });
  });
});

describe('blendMemory', () => {
  it('with no prior returns the clamped sample stamped now', () => {
    expect(blendMemory(null, { settleMs: 800, scrolls: 20 }, 1234))
      .toEqual({ settleMs: 800, scrolls: 20, updatedAt: 1234 });
  });
  it('EMA-blends prior with sample at weight 0.5 and rounds', () => {
    const old = { settleMs: 400, scrolls: 10, updatedAt: 1 };
    expect(blendMemory(old, { settleMs: 900, scrolls: 25 }, 2000))
      .toEqual({ settleMs: 650, scrolls: 18, updatedAt: 2000 });
  });
  it('clamps a wild sample before blending', () => {
    const m = blendMemory(null, { settleMs: 1e9, scrolls: 1e9 }, 5);
    expect(m.settleMs).toBe(SCAN_MEMORY_SETTLE_MAX);
    expect(m.scrolls).toBe(SCAN_MEMORY_SCROLLS_MAX);
  });
});

describe('evictToCap', () => {
  it('returns the store unchanged when at or under cap', () => {
    const store = { 'a.com': { settleMs: 1, scrolls: 1, updatedAt: 1 } };
    expect(evictToCap(store, 200)).toEqual(store);
  });
  it('drops the oldest by updatedAt down to cap, without mutating input', () => {
    const store: Record<string, { settleMs: number; scrolls: number; updatedAt: number }> = {
      old: { settleMs: 1, scrolls: 1, updatedAt: 10 },
      mid: { settleMs: 1, scrolls: 1, updatedAt: 20 },
      new: { settleMs: 1, scrolls: 1, updatedAt: 30 },
    };
    const out = evictToCap(store, 2);
    expect(Object.keys(out).sort()).toEqual(['mid', 'new']);
    expect(Object.keys(store)).toHaveLength(3);
  });
  it('caps at SCAN_MEMORY_MAX_HOSTS by default', () => {
    const store: Record<string, { settleMs: number; scrolls: number; updatedAt: number }> = {};
    for (let i = 0; i < SCAN_MEMORY_MAX_HOSTS + 5; i++) store[`h${i}.com`] = { settleMs: 1, scrolls: 1, updatedAt: i };
    expect(Object.keys(evictToCap(store))).toHaveLength(SCAN_MEMORY_MAX_HOSTS);
  });
});

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
