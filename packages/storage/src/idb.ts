import { get, set, del, createStore } from 'idb-keyval';

// One database, one object store, version 1 — no schema evolution, so IndexedDB's
// migration footguns don't apply. This is the durable mirror behind chrome.storage.local.
const store = createStore('media-bulk-downloads', 'kv');

export const idbGet = <T>(key: string): Promise<T | undefined> => get<T>(key, store);
export const idbSet = (key: string, value: unknown): Promise<void> => set(key, value, store);
export const idbDelete = (key: string): Promise<void> => del(key, store);

/**
 * Write-through: the reactive working copy (chrome.storage.local, which fires onChanged)
 * plus the durable IDB mirror. Only the local write is awaited — callers (and the
 * download queue's serialized mutation chain) depend on its ordering and immediate
 * reactivity and must NOT be blocked on the IDB round-trip. The IDB mirror is
 * fire-and-forget best-effort: a failure is logged, never rethrown, and a lost mirror write
 * is repaired from local by syncStores() on the next startup (local-wins-if-present).
 *
 * Resolves to whether the local write PERSISTED: `true` on success, `false` if it
 * rejected (almost always QUOTA_BYTES exceeded on the shared ~5MB budget). It never
 * rejects — every caller `void`s or awaits it — but returning the outcome instead of
 * swallowing it lets an upper layer surface a "not saved — storage full" warning
 * rather than silently losing the user's action on the next service-worker restart.
 */
export function durableSet(key: string, value: unknown): Promise<boolean> {
  const local = chrome.storage.local
    .set({ [key]: value })
    .then(() => true)
    .catch((e) => {
      console.error('[storage] chrome.storage.local write failed (quota?)', key, e);
      return false;
    });
  void idbSet(key, value).catch((e) => console.warn('[storage] IDB mirror write failed', key, e));
  return local;
}
