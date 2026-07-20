import { ScanMemory } from '@mbd/core/types';
import { durableSet } from '@mbd/storage/idb';

/**
 * Per-host learned deep-scan behaviour (phase-2, follows #293). A
 * Record<registrableDomain, ScanMemory> in chrome.storage.local: the cross-visit
 * EMA of each site's converged settle time and scroll depth, so a repeat deep
 * scan can start warm. Absent host = null = cold start (today's behaviour).
 * Never synced; only numbers are stored, never URLs or page content.
 */
export const PER_HOST_SCAN_MEMORY_KEY = 'perHostScanMemory';

/** Weight on the newest sample when blending across visits. */
export const SCAN_MEMORY_BLEND_WEIGHT = 0.5;
/** LRU cap on remembered hosts; oldest updatedAt evicted past this. */
export const SCAN_MEMORY_MAX_HOSTS = 200;
/** Sane numeric ceilings so a corrupt store can never inject an absurd seed.
 *  settleMs is additionally re-bounded downstream by the loop's quiet/hardCap clamps. */
export const SCAN_MEMORY_SETTLE_MAX = 10000;
export const SCAN_MEMORY_SCROLLS_MAX = 500;

const isSaneNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const clampNum = (x: number, hi: number): number => Math.min(hi, Math.max(0, x));

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Coerce a raw entry to a valid ScanMemory, or null if unusable (missing/NaN/
 *  negative settleMs or scrolls). Clamps to the SCAN_MEMORY_*_MAX bounds; an
 *  insane/absent updatedAt becomes 0. Pure. */
export function clampMemory(raw: unknown): ScanMemory | null {
  const o = asObject(raw);
  if (!isSaneNumber(o.settleMs) || !isSaneNumber(o.scrolls)) return null;
  return {
    settleMs: clampNum(o.settleMs, SCAN_MEMORY_SETTLE_MAX),
    scrolls: clampNum(o.scrolls, SCAN_MEMORY_SCROLLS_MAX),
    updatedAt: isSaneNumber(o.updatedAt) ? o.updatedAt : 0,
  };
}

/** Cross-visit EMA blend of a stored memory with a fresh sample. No prior (null)
 *  → the clamped sample. Results are clamped and scroll depth is rounded to an
 *  integer. `now` stamps updatedAt. Pure. */
export function blendMemory(
  old: ScanMemory | null,
  sample: { settleMs: number; scrolls: number },
  now: number,
  weight: number = SCAN_MEMORY_BLEND_WEIGHT,
): ScanMemory {
  const s = clampNum(isSaneNumber(sample.settleMs) ? sample.settleMs : 0, SCAN_MEMORY_SETTLE_MAX);
  const c = clampNum(isSaneNumber(sample.scrolls) ? sample.scrolls : 0, SCAN_MEMORY_SCROLLS_MAX);
  if (!old) return { settleMs: Math.round(s), scrolls: Math.round(c), updatedAt: now };
  const w = weight;
  return {
    settleMs: Math.round((1 - w) * old.settleMs + w * s),
    scrolls: Math.round((1 - w) * old.scrolls + w * c),
    updatedAt: now,
  };
}

/** If the store exceeds `cap` hosts, drop the oldest by updatedAt until at cap.
 *  Returns a new record; never mutates the input. Pure. */
export function evictToCap(
  store: Record<string, ScanMemory>,
  cap: number = SCAN_MEMORY_MAX_HOSTS,
): Record<string, ScanMemory> {
  const entries = Object.entries(store);
  if (entries.length <= cap) return { ...store };
  entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const kept = entries.slice(entries.length - cap);
  return Object.fromEntries(kept);
}

/** The whole scan-memory store, each entry validated via clampMemory (bad
 *  entries dropped). */
export async function loadScanMemory(): Promise<Record<string, ScanMemory>> {
  const result = (await chrome.storage.local.get(PER_HOST_SCAN_MEMORY_KEY)) as Record<string, unknown>;
  const raw = asObject(result[PER_HOST_SCAN_MEMORY_KEY]);
  const out: Record<string, ScanMemory> = {};
  for (const [host, val] of Object.entries(raw)) {
    const m = clampMemory(val);
    if (host && m) out[host] = m;
  }
  return out;
}

/** One host's learned memory, or null when absent/invalid. `host` is a
 *  registrable domain (caller reduces location.hostname). */
export async function loadScanMemoryForHost(host: string): Promise<ScanMemory | null> {
  if (!host) return null;
  const store = await loadScanMemory();
  return store[host] ?? null;
}

let writeChain: Promise<void> = Promise.resolve();
function serialize(task: () => Promise<void>): Promise<void> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Blend a fresh sample into a host's memory (cross-visit EMA), stamp
 *  updatedAt = now, and LRU-evict to cap. No-op for an empty host. */
export async function saveScanMemoryForHost(
  host: string,
  sample: { settleMs: number; scrolls: number },
  now: number = Date.now(),
): Promise<void> {
  if (!host) return;
  return serialize(async () => {
    const store = await loadScanMemory();
    store[host] = blendMemory(store[host] ?? null, sample, now);
    await durableSet(PER_HOST_SCAN_MEMORY_KEY, evictToCap(store));
  });
}

/** Remove a host's memory entirely ("Reset this site"). */
export async function clearScanMemoryForHost(host: string): Promise<void> {
  if (!host) return;
  return serialize(async () => {
    const store = await loadScanMemory();
    if (!(host in store)) return;
    delete store[host];
    await durableSet(PER_HOST_SCAN_MEMORY_KEY, store);
  });
}
