// Value-import from the pre-bundled ESM (deno desktop can't resolve bare
// @mbd/core source imports — see docs/runtime-recipe.md). Type-only imports stay
// on @mbd/core/types (erased at runtime, no resolution needed).
import { mergeHistory, canonicalSrcKey } from '../core-bundle/download-name.gen.js';
import type { HistoryEntry } from '@mbd/core/types';
import type { Store } from './kv.ts';

/** HistoryEntry plus the on-disk download path (desktop-only; used for
 *  duplicate-file detection). mergeHistory is typed HistoryEntry[]→HistoryEntry[]
 *  but preserves the actual objects, so `path` survives the round-trip. */
export type StoredHistoryEntry = HistoryEntry & { path?: string };

const KEY = 'downloadHistory';

export async function loadHistory(store: Store): Promise<StoredHistoryEntry[]> {
  return (await store.durableGet<StoredHistoryEntry[]>(KEY)) ?? [];
}

export async function recordDownloads(store: Store, added: StoredHistoryEntry[]): Promise<void> {
  if (!added.length) return;
  const merged = mergeHistory(await loadHistory(store), added) as StoredHistoryEntry[];
  await store.durableSet(KEY, merged);
}

export async function removeHistoryEntry(store: Store, src: string): Promise<void> {
  const k = canonicalSrcKey(src);
  await store.durableSet(KEY, (await loadHistory(store)).filter((e) => canonicalSrcKey(e.src) !== k));
}

export async function clearHistory(store: Store): Promise<void> {
  await store.durableSet(KEY, []);
}
