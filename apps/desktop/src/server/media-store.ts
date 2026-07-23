import { canonicalSrcKey } from '../core-bundle/download-name.gen.js';

export interface CollectedItem {
  src: string;
  kind: 'image' | 'video' | 'audio';
  type?: string;
  ext?: string;
  thumbnailSrc?: string;
  poster?: string;
  width?: number;
  height?: number;
  sourcePage?: { url?: string; title?: string };
}

export interface MediaStore {
  merge(items: CollectedItem[]): CollectedItem[];
  list(): CollectedItem[];
  clear(): void;
  get(src: string): CollectedItem | undefined;
}

export function createMediaStore(): MediaStore {
  const byKey = new Map<string, CollectedItem>();
  return {
    merge(items) {
      const added: CollectedItem[] = [];
      for (const it of items) {
        if (!it?.src) continue;
        const k = canonicalSrcKey(it.src);
        if (byKey.has(k)) continue;
        byKey.set(k, it);
        added.push(it);
      }
      return added;
    },
    list: () => [...byKey.values()],
    clear: () => byKey.clear(),
    get: (src) => byKey.get(canonicalSrcKey(src)),
  };
}
