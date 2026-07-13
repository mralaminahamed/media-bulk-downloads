import { ExcludedEntry, ExcludedKind } from '@mbd/core/types';
import { canonicalSrcKey, SrcKeySet } from '@mbd/core/collection/canonical';
import { registrableDomain } from '@mbd/core/collection/paths';
import { durableSet } from '@mbd/storage/idb';
import { withinByteBudget } from '@mbd/storage/byte-budget';

/**
 * Blocklist of excluded sources — exact media URLs and hosts — that the
 * collection filter hides from the grid, deep-scan results, and badge count.
 * Mirrors favourites.ts: single-writer serialized read-modify-writes into
 * chrome.storage.local, deduped, count-capped, and bounded by serialized bytes
 * (a 'url' entry can be a long data URL).
 */
export const EXCLUDED_KEY = 'excluded';
export const EXCLUDED_CAP = 500;
// Sized to co-exist under the shared ~5MB chrome.storage.local quota alongside
// history (2MB) and favourites (1MB). See favourites.ts for the budget split.
export const EXCLUDED_MAX_BYTES = 500_000;

// URL entries dedup by canonical src key (so query/host-variant re-adds collapse);
// host entries by their exact value.
const keyOf = (e: ExcludedEntry): string => `${e.kind} ${e.kind === 'url' ? canonicalSrcKey(e.value) : e.value}`;

/** Merge added into existing: dedup by kind+value (newest wins, front),
 *  newest-first, capped by count then serialized size. Pure. */
export function mergeExcluded(existing: ExcludedEntry[], added: ExcludedEntry[]): ExcludedEntry[] {
  const map = new Map<string, ExcludedEntry>();
  // Newest-wins for duplicate keys within `added` too (not array-order-last).
  for (const entry of added) {
    const k = keyOf(entry);
    const prev = map.get(k);
    if (!prev || entry.time > prev.time) map.set(k, entry);
  }
  for (const entry of existing) { const k = keyOf(entry); if (!map.has(k)) map.set(k, entry); }
  const ranked = [...map.values()].sort((a, b) => b.time - a.time).slice(0, EXCLUDED_CAP);
  return withinByteBudget(ranked, EXCLUDED_MAX_BYTES);
}

export async function loadExcluded(): Promise<ExcludedEntry[]> {
  const result = await chrome.storage.local.get(EXCLUDED_KEY);
  const raw = (result as Record<string, unknown>)[EXCLUDED_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is ExcludedEntry =>
      !!e && typeof e === 'object' &&
      typeof (e as ExcludedEntry).value === 'string' &&
      ((e as ExcludedEntry).kind === 'url' || (e as ExcludedEntry).kind === 'host'))
    .map((e) => ({ value: (e as ExcludedEntry).value, kind: (e as ExcludedEntry).kind, time: Number((e as ExcludedEntry).time) || 0 }));
}

let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Resolves to whether the write persisted (see durableSet). */
export async function addExcluded(entry: ExcludedEntry): Promise<boolean> {
  return serialize(async () => {
    const merged = mergeExcluded(await loadExcluded(), [entry]);
    return durableSet(EXCLUDED_KEY, merged);
  });
}

export async function removeExcluded(kind: ExcludedKind, value: string): Promise<void> {
  return serialize(async () => {
    const next = (await loadExcluded()).filter(
      (e) => !(e.kind === kind && (kind === 'url' ? canonicalSrcKey(e.value) === canonicalSrcKey(value) : e.value === value)),
    );
    await durableSet(EXCLUDED_KEY, next);
  });
}

export async function restoreExcluded(entries: ExcludedEntry[]): Promise<void> {
  return serialize(async () => {
    await durableSet(EXCLUDED_KEY, mergeExcluded([], entries));
  });
}

export async function clearExcluded(): Promise<void> {
  return serialize(async () => {
    await durableSet(EXCLUDED_KEY, []);
  });
}

/** The url + host match sets for O(1) exclusion checks. URL entries are keyed by
 *  their canonical src key so an excluded image stays excluded across volatile
 *  CDN query/host changes (see canonicalSrcKey). Host entries are reduced to their
 *  registrable domain so the exclusion covers the whole site and survives rotating
 *  CDN edge PoPs (fbcdn/cdninstagram) — and legacy exact-host entries still match. */
export async function excludedMatchers(): Promise<{ urls: SrcKeySet; hosts: Set<string> }> {
  const all = await loadExcluded();
  return {
    urls: SrcKeySet.from(all.filter((e) => e.kind === 'url').map((e) => e.value)),
    hosts: new Set(all.filter((e) => e.kind === 'host').map((e) => registrableDomain(e.value))),
  };
}
