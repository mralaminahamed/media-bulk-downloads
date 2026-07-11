import { get, set, del, createStore } from 'idb-keyval';

// One database, one object store, version 1 — no schema evolution, so IndexedDB's
// migration footguns don't apply. This is the durable mirror behind chrome.storage.local.
const store = createStore('media-bulk-downloads', 'kv');

export const idbGet = <T>(key: string): Promise<T | undefined> => get<T>(key, store);
export const idbSet = (key: string, value: unknown): Promise<void> => set(key, value, store);
export const idbDelete = (key: string): Promise<void> => del(key, store);

/**
 * Write-through: the reactive working copy (chrome.storage.local, which fires onChanged)
 * plus the durable IDB mirror. local is awaited (callers depend on its serialized ordering
 * and immediate reactivity); the IDB mirror is best-effort — an IDB failure is logged and
 * never breaks the local write or existing behavior.
 */
export async function durableSet(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
  try {
    await idbSet(key, value);
  } catch (e) {
    console.warn('[storage] IDB mirror write failed', key, e);
  }
}
