import { useState, useCallback } from 'react';
import { ListVariantsMessage, ListVariantsResult, StreamVariant } from '@mbd/core/types';

export type VariantState = { status: 'idle' | 'loading' | 'done' | 'error'; variants: StreamVariant[] };

// Shared across every hook instance so the grid tile and preview panel reuse one
// fetch per manifest, and a re-mounted picker is instant. Keyed by manifest URL.
const cache = new Map<string, StreamVariant[]>();

/**
 * Lazily fetch + cache a stream's selectable renditions (#314). `ensure` sends one
 * `LIST_VARIANTS` per manifest URL (deduped by cache + in-flight status) and is
 * called ONLY on an explicit picker-open gesture — never on tile render — so a
 * dense grid triggers no fetch storm.
 */
export function useStreamVariants(): {
  states: Map<string, VariantState>;
  ensure: (manifestUrl: string, engine: 'hls' | 'dash') => void;
} {
  const [states, setStates] = useState<Map<string, VariantState>>(new Map());

  const ensure = useCallback((manifestUrl: string, engine: 'hls' | 'dash'): void => {
    setStates((prev) => {
      if (prev.get(manifestUrl)?.status === 'loading' || prev.get(manifestUrl)?.status === 'done') return prev;
      const cached = cache.get(manifestUrl);
      const next = new Map(prev);
      if (cached) { next.set(manifestUrl, { status: 'done', variants: cached }); return next; }
      next.set(manifestUrl, { status: 'loading', variants: [] });
      void (async () => {
        const msg: ListVariantsMessage = { type: 'LIST_VARIANTS', manifestUrl, engine };
        let res: ListVariantsResult | undefined;
        try { res = (await chrome.runtime.sendMessage(msg)) as ListVariantsResult; } catch { /* errored below */ }
        setStates((cur) => {
          const m = new Map(cur);
          if (res && res.ok) { cache.set(manifestUrl, res.variants); m.set(manifestUrl, { status: 'done', variants: res.variants }); }
          else m.set(manifestUrl, { status: 'error', variants: [] });
          return m;
        });
      })();
      return next;
    });
  }, []);

  return { states, ensure };
}
