import { syncStores, persistStorage } from '@/extension/shared/storage/sync';
import { idbGet, idbSet } from '@/extension/shared/storage/idb';
import { HISTORY_KEY } from '@/extension/shared/storage/history';
import { FAVOURITES_KEY } from '@/extension/shared/storage/favourites';

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
    const data = mockLocal({}); // local evicted
    await idbSet(FAVOURITES_KEY, [{ src: 'f' }]); // IDB still has it
    await syncStores();
    expect(data[FAVOURITES_KEY]).toEqual([{ src: 'f' }]); // restored into local
  });

  it('local wins when both present and differ (IDB repaired to local)', async () => {
    const data = mockLocal({ [HISTORY_KEY]: [{ src: 'local' }] });
    await idbSet(HISTORY_KEY, [{ src: 'stale-idb' }]);
    await syncStores();
    expect(data[HISTORY_KEY]).toEqual([{ src: 'local' }]);        // local untouched
    expect(await idbGet(HISTORY_KEY)).toEqual([{ src: 'local' }]); // IDB repaired
  });

  it('treats an empty array in local as present (not healed from IDB)', async () => {
    const data = mockLocal({ [HISTORY_KEY]: [] });
    await idbSet(HISTORY_KEY, [{ src: 'old' }]);
    await syncStores();
    expect(data[HISTORY_KEY]).toEqual([]);                 // local [] wins
    expect(await idbGet(HISTORY_KEY)).toEqual([]);          // IDB repaired to []
  });
});

describe('persistStorage', () => {
  it('does not throw when navigator.storage is unavailable', async () => {
    await expect(persistStorage()).resolves.toBeUndefined();
  });
});
