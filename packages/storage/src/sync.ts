import { idbGet, idbSet } from '@mbd/storage/idb';
import { HISTORY_KEY } from '@mbd/storage/history';
import { FAVOURITES_KEY } from '@mbd/storage/favourites';
import { EXCLUDED_KEY } from '@mbd/storage/excluded';
import { QUEUE_KEY } from '@mbd/storage/download-queue';
import { PER_HOST_SETTINGS_KEY } from '@mbd/storage/per-host-settings';
import { PER_HOST_SCAN_MEMORY_KEY } from '@mbd/storage/per-host-scan-memory';

export const MANAGED_KEYS = [
  HISTORY_KEY, FAVOURITES_KEY, EXCLUDED_KEY, QUEUE_KEY,
  PER_HOST_SETTINGS_KEY, PER_HOST_SCAN_MEMORY_KEY,
];

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
 *
 * Runs unawaited at background startup while the writer listeners are already
 * live, so the restore branch re-checks local immediately before writing: a
 * concurrent legitimate write (e.g. an enqueue) may have repopulated the key in
 * the meantime, and restoring the older IDB snapshot over it would clobber that
 * fresh write — the exact data loss this heal exists to prevent. It restores
 * only while local is still genuinely absent. (The store modules serialize their
 * own writes; this heal is a best-effort seed/restore that must not fight them.)
 */
export async function syncStores(): Promise<void> {
  for (const key of MANAGED_KEYS) {
    try {
      const localRes = await chrome.storage.local.get(key);
      if (key in localRes) {
        await idbSet(key, (localRes as Record<string, unknown>)[key]);
      } else {
        const fromIdb = await idbGet(key);
        if (fromIdb !== undefined) {
          const recheck = await chrome.storage.local.get(key);
          if (!(key in recheck)) await chrome.storage.local.set({ [key]: fromIdb });
        }
      }
    } catch (e) {
      console.warn('[storage] syncStores failed for', key, e);
    }
  }
}
