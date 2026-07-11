import { idbGet, idbSet } from './idb';
import { HISTORY_KEY } from './history';
import { FAVOURITES_KEY } from './favourites';
import { EXCLUDED_KEY } from './excluded';
import { QUEUE_KEY } from './download-queue';

export const MANAGED_KEYS = [HISTORY_KEY, FAVOURITES_KEY, EXCLUDED_KEY, QUEUE_KEY];

/** Ask the browser to make our storage persistent (non-evictable). Guarded for
 *  environments without the Storage API (jsdom). Best-effort — never throws. */
export async function persistStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      console.info('[storage] persistent storage', granted ? 'granted' : 'not granted');
    }
  } catch { /* ignore */ }
}

/**
 * Reconcile local <-> IDB on startup. Precedence: local-wins-if-present.
 *  - local has the key (even []): local is the live truth -> repair the IDB mirror.
 *  - local missing the key (evicted) but IDB has it -> restore local from IDB (the
 *    local.set fires onChanged, so any open UI refreshes).
 * Best-effort per key; one key's failure never aborts the rest.
 */
export async function syncStores(): Promise<void> {
  for (const key of MANAGED_KEYS) {
    try {
      const localRes = await chrome.storage.local.get(key);
      if (key in localRes) {
        await idbSet(key, (localRes as Record<string, unknown>)[key]);
      } else {
        const fromIdb = await idbGet(key);
        if (fromIdb !== undefined) await chrome.storage.local.set({ [key]: fromIdb });
      }
    } catch (e) {
      console.warn('[storage] syncStores failed for', key, e);
    }
  }
}
