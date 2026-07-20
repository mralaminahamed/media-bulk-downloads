import { durableSet } from '@mbd/storage/idb';

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: vi.fn(),
  set: vi.fn().mockRejectedValue(new Error('idb down')),
  del: vi.fn(),
}));

describe('durableSet — IDB mirror failure is best-effort', () => {
  it('still lands the local write, resolves, and logs when the IDB set rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(durableSet('favourites', [1])).resolves.toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ favourites: [1] });
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
