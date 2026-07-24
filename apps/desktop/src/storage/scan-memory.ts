// Value-import from the pre-bundled ESM (deno desktop can't resolve bare
// @mbd/core source imports — see docs/runtime-recipe.md). Type-only imports stay
// on @mbd/core/types (erased at runtime, no resolution needed).
import { blendMemory, clampMemory, evictToCap } from '../core-bundle/download-name.gen.js';
import type { ScanMemory } from '@mbd/core/types';
import type { Store } from './kv.ts';

const KEY = 'perHostScanMemory';

export async function loadScanMemory(store: Store, host: string): Promise<ScanMemory | null> {
  const record = (await store.durableGet<Record<string, unknown>>(KEY)) ?? {};
  return clampMemory(record[host]);
}

export async function saveScanMemory(
  store: Store,
  host: string,
  sample: { settleMs: number; scrolls: number },
  now: number,
): Promise<void> {
  const record = (await store.durableGet<Record<string, ScanMemory>>(KEY)) ?? {};
  const blended = blendMemory(clampMemory(record[host]), sample, now);
  const next = evictToCap({ ...record, [host]: blended });
  await store.durableSet(KEY, next);
}
