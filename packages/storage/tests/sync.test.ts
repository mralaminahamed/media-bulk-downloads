import { syncStores, persistStorage } from '@mbd/storage/sync';
import { idbGet, idbSet } from '@mbd/storage/idb';
import { HISTORY_KEY } from '@mbd/storage/history';
import { FAVOURITES_KEY } from '@mbd/storage/favourites';

type Local = Record<string, unknown>;
function mockLocal(initial: Local) {
  const data: Local = { ...initial };
  (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (key: string) => (key in data ? { [key]: data[key] } : {}),
  );
  (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (obj: Local) => { Object.assign(data, obj); },
  );
  return data;
}

describe('syncStores', () => {
  it('seeds/repairs the IDB mirror from local when local is present', async () => {
    mockLocal({ [HISTORY_KEY]: [{ src: 'a' }] });
    await syncStores();
    expect(await idbGet(HISTORY_KEY)).toEqual([{ src: 'a' }]);
  });

  it('heals local from IDB when local is missing the key', async () => {
    const data = mockLocal({});
    await idbSet(FAVOURITES_KEY, [{ src: 'f' }]);
    await syncStores();
    expect(data[FAVOURITES_KEY]).toEqual([{ src: 'f' }]);
  });

  it('local wins when both present and differ (IDB repaired to local)', async () => {
    const data = mockLocal({ [HISTORY_KEY]: [{ src: 'local' }] });
    await idbSet(HISTORY_KEY, [{ src: 'stale-idb' }]);
    await syncStores();
    expect(data[HISTORY_KEY]).toEqual([{ src: 'local' }]);
    expect(await idbGet(HISTORY_KEY)).toEqual([{ src: 'local' }]);
  });

  it('treats an empty array in local as present (not healed from IDB)', async () => {
    const data = mockLocal({ [HISTORY_KEY]: [] });
    await idbSet(HISTORY_KEY, [{ src: 'old' }]);
    await syncStores();
    expect(data[HISTORY_KEY]).toEqual([]);
    expect(await idbGet(HISTORY_KEY)).toEqual([]);
  });

  it('does not clobber a fresh local write that landed during the heal (re-check)', async () => {
    await idbSet(HISTORY_KEY, [{ src: 'stale-idb' }]);
    const getCalls: Record<string, number> = {};
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    const set = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    get.mockReset().mockImplementation(async (key: string) => {
      getCalls[key] = (getCalls[key] ?? 0) + 1;
      if (key === HISTORY_KEY && getCalls[key] >= 2) return { [HISTORY_KEY]: [{ src: 'fresh' }] };
      return {};
    });
    set.mockReset().mockResolvedValue(undefined);
    await syncStores();
    expect(set).not.toHaveBeenCalledWith({ [HISTORY_KEY]: [{ src: 'stale-idb' }] });
  });
});

describe('persistStorage', () => {
  it('does not throw when navigator.storage is unavailable', async () => {
    await expect(persistStorage()).resolves.toBeUndefined();
  });
});
