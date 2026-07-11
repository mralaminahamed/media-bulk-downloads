import { idbGet, idbSet, idbDelete, durableSet } from '@/extension/shared/storage/idb';

describe('idb key-value store', () => {
  it('round-trips a value through set/get and removes it with delete', async () => {
    await idbSet('k1', [{ a: 1 }]);
    expect(await idbGet('k1')).toEqual([{ a: 1 }]);
    await idbDelete('k1');
    expect(await idbGet('k1')).toBeUndefined();
  });
});

describe('durableSet', () => {
  beforeEach(() => {
    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockClear?.();
  });

  it('writes to BOTH chrome.storage.local and the IDB mirror', async () => {
    await durableSet('downloadHistory', [{ src: 'x' }]);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ downloadHistory: [{ src: 'x' }] });
    expect(await idbGet('downloadHistory')).toEqual([{ src: 'x' }]);
  });
});
