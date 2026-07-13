import { RefObject, useEffect, useRef, useState } from 'react';
import { ExcludedKind } from '@mbd/core/types';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { ExcludedMatchers } from '@mbd/core/collection/filters';
import { excludedMatchers, EXCLUDED_KEY } from '@mbd/storage/excluded';

export interface UseExcludedResult {
  excludedMatch: ExcludedMatchers;
  excludedRef: RefObject<ExcludedMatchers>;
  applyExcludedOptimistic: (updates: { kind: ExcludedKind; value: string; src: string }[]) => void;
}

/**
 * Tracks the excluded blocklist (urls + hosts), loaded on mount and reloaded
 * on a local EXCLUDED_KEY storage change. `excludedRef` mirrors the latest
 * value for synchronous reads from the scan/resolution engine (still in App),
 * which must see the current exclusions without a stale closure.
 */
export function useExcluded(): UseExcludedResult {
  const [excludedMatch, setExcludedMatch] = useState<ExcludedMatchers>({ urls: new SrcKeySet(), hosts: new Set() });
  const excludedRef = useRef<ExcludedMatchers>({ urls: new SrcKeySet(), hosts: new Set() });

  useEffect(() => {
    const load = () => void excludedMatchers().then((m) => { excludedRef.current = m; setExcludedMatch(m); });
    load();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[EXCLUDED_KEY]) load();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // Hide excluded media from the grid immediately, before the background's write
  // round-trips back through storage.onChanged (which reconciles to the same
  // state). Mirrors the optimistic favourite update in useFavourites. A 'url'
  // exclusion is keyed by the src's canonical key; a 'host' exclusion by its
  // registrable domain.
  const applyExcludedOptimistic = (updates: { kind: ExcludedKind; value: string; src: string }[]): void => {
    let urls = excludedRef.current.urls;
    const hosts = new Set(excludedRef.current.hosts);
    for (const u of updates) {
      if (u.kind === 'url') urls = urls.withAdded(u.src);
      else hosts.add(u.value);
    }
    const next = { urls, hosts };
    excludedRef.current = next;
    setExcludedMatch(next);
  };

  return { excludedMatch, excludedRef, applyExcludedOptimistic };
}
