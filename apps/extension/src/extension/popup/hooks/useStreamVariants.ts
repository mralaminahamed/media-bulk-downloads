import { useState, useCallback } from 'react';
import { ListVariantsMessage, ListVariantsResult, StreamVariant } from '@mbd/core/types';

export type VariantState = { status: 'idle' | 'loading' | 'done' | 'error'; variants: StreamVariant[] };

// Shared across every hook instance so the grid tile and preview panel reuse one
// fetch per manifest, and a re-mounted picker is instant. Keyed by manifest URL.
const cache = new Map<string, StreamVariant[]>();
// In-flight LIST_VARIANTS promises, also module-level. The per-instance
// 'loading' guard only dedups WITHIN one hook; two separate useStreamVariants()
// instances that call ensure(sameUrl) before the first resolves would each fire
// a request without this. Both instances await the one shared promise instead.
const inflight = new Map<string, Promise<ListVariantsResult>>();

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
      // One network send per URL across ALL instances: the first caller creates
      // the shared promise; a concurrent caller (a second hook instance) reuses it.
      let p = inflight.get(manifestUrl);
      if (!p) {
        const msg: ListVariantsMessage = { type: 'LIST_VARIANTS', manifestUrl, engine };
        p = Promise.resolve(chrome.runtime.sendMessage(msg)).then(
          (r) => r as ListVariantsResult,
          () => ({ ok: false, code: 'variant_list_failed' }) as ListVariantsResult,
        );
        inflight.set(manifestUrl, p);
        void p.then((res) => {
          if (res.ok) cache.set(manifestUrl, res.variants);
          inflight.delete(manifestUrl);
        });
      }
      // Every instance resolves its OWN local state from the shared promise.
      void p.then((res) =>
        setStates((cur) => {
          const m = new Map(cur);
          m.set(manifestUrl, res.ok ? { status: 'done', variants: res.variants } : { status: 'error', variants: [] });
          return m;
        }),
      );
      return next;
    });
  }, []);

  return { states, ensure };
}
