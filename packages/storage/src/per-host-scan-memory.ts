import { ScanMemory } from '@mbd/core/types';
import { durableSet } from '@mbd/storage/idb';
import {
  clampMemory, blendMemory, evictToCap,
  SCAN_MEMORY_BLEND_WEIGHT, SCAN_MEMORY_MAX_HOSTS, SCAN_MEMORY_SETTLE_MAX, SCAN_MEMORY_SCROLLS_MAX,
} from '@mbd/core/collection/scan-memory';

/**
 * Per-host learned deep-scan behaviour (phase-2, follows #293). A
 * Record<registrableDomain, ScanMemory> in chrome.storage.local: the cross-visit
 * EMA of each site's converged settle time and scroll depth, so a repeat deep
 * scan can start warm. Absent host = null = cold start (today's behaviour).
 * Never synced; only numbers are stored, never URLs or page content.
 */
export const PER_HOST_SCAN_MEMORY_KEY = 'perHostScanMemory';

export {
  clampMemory, blendMemory, evictToCap,
  SCAN_MEMORY_BLEND_WEIGHT, SCAN_MEMORY_MAX_HOSTS, SCAN_MEMORY_SETTLE_MAX, SCAN_MEMORY_SCROLLS_MAX,
};

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

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
