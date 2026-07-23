import { partitionByDownloaded, SrcKeySet } from '../core-bundle/download-name.gen.js';
import { loadHistory } from '../storage/history.ts';
import type { Store } from '../storage/kv.ts';

export async function downloadedKeysOnDisk(
  store: Store,
  opts?: { statImpl?: (p: string) => Promise<unknown> },
): Promise<SrcKeySet> {
  const stat = opts?.statImpl ?? ((p: string) => Deno.stat(p));
  const srcs: string[] = [];
  for (const e of await loadHistory(store)) {
    const p = e.path;
    if (!p) continue;
    try {
      await stat(p);
      srcs.push(e.src);
    } catch {
      /* file gone → re-downloadable */
    }
  }
  return SrcKeySet.from(srcs);
}

export function splitByDownloaded<T extends { src: string }>(
  items: readonly T[],
  keys: SrcKeySet,
): { keep: T[]; skipped: T[] } {
  return partitionByDownloaded(items as never, keys) as unknown as { keep: T[]; skipped: T[] };
}
