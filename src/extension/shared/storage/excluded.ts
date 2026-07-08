import { ExcludedEntry, ExcludedKind } from '@/types';
import { canonicalSrcKey, SrcKeySet } from '../collection/canonical';

/**
 * Blocklist of excluded sources — exact media URLs and hosts — that the
 * collection filter hides from the grid, deep-scan results, and badge count.
 * Mirrors favourites.ts: single-writer serialized read-modify-writes into
 * chrome.storage.local, deduped, count-capped, and bounded by serialized bytes
 * (a 'url' entry can be a long data URL).
 */
export const EXCLUDED_KEY = 'excluded';
export const EXCLUDED_CAP = 500;
export const EXCLUDED_MAX_BYTES = 2_000_000;

// URL entries dedup by canonical src key (so query/host-variant re-adds collapse);
// host entries by their exact value.
const keyOf = (e: ExcludedEntry): string => `${e.kind} ${e.kind === 'url' ? canonicalSrcKey(e.value) : e.value}`;

function withinByteBudget(entries: ExcludedEntry[], maxBytes: number): ExcludedEntry[] {
  let total = 0;
  const out: ExcludedEntry[] = [];
  for (const entry of entries) {
    total += JSON.stringify(entry).length;
    if (total > maxBytes && out.length) break;
    out.push(entry);
  }
  return out;
}

/** Merge added into existing: dedup by kind+value (newest wins, front),
 *  newest-first, capped by count then serialized size. Pure. */
export function mergeExcluded(existing: ExcludedEntry[], added: ExcludedEntry[]): ExcludedEntry[] {
  const map = new Map<string, ExcludedEntry>();
  for (const entry of added) map.set(keyOf(entry), entry);
  for (const entry of existing) if (!map.has(keyOf(entry))) map.set(keyOf(entry), entry);
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

let writeChain: Promise<void> = Promise.resolve();
function serialize(task: () => Promise<void>): Promise<void> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

export async function addExcluded(entry: ExcludedEntry): Promise<void> {
  return serialize(async () => {
    const merged = mergeExcluded(await loadExcluded(), [entry]);
    await chrome.storage.local.set({ [EXCLUDED_KEY]: merged });
  });
}

export async function removeExcluded(kind: ExcludedKind, value: string): Promise<void> {
  return serialize(async () => {
    const next = (await loadExcluded()).filter(
      (e) => !(e.kind === kind && (kind === 'url' ? canonicalSrcKey(e.value) === canonicalSrcKey(value) : e.value === value)),
    );
    await chrome.storage.local.set({ [EXCLUDED_KEY]: next });
  });
}

export async function restoreExcluded(entries: ExcludedEntry[]): Promise<void> {
  return serialize(async () => {
    await chrome.storage.local.set({ [EXCLUDED_KEY]: mergeExcluded([], entries) });
  });
}

export async function clearExcluded(): Promise<void> {
  return serialize(async () => {
    await chrome.storage.local.set({ [EXCLUDED_KEY]: [] });
  });
}

/** The url + host match sets for O(1) exclusion checks. URL entries are keyed by
 *  their canonical src key so an excluded image stays excluded across volatile
 *  CDN query/host changes (see canonicalSrcKey). */
export async function excludedMatchers(): Promise<{ urls: SrcKeySet; hosts: Set<string> }> {
  const all = await loadExcluded();
  return {
    urls: SrcKeySet.from(all.filter((e) => e.kind === 'url').map((e) => e.value)),
    hosts: new Set(all.filter((e) => e.kind === 'host').map((e) => e.value)),
  };
}
