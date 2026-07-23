import type { ApiHandler } from './types.ts';
import type { MediaStore } from './media-store.ts';
import type { SseHub } from './sse.ts';
import type { Store } from '../storage/kv.ts';
import type { DesktopSettings } from '../storage/settings.ts';
import { loadHistory, removeHistoryEntry, clearHistory } from '../storage/history.ts';
import { loadFavourites, addFavourite, removeFavourite } from '../storage/favourites.ts';
import { downloadedKeysOnDisk, splitByDownloaded } from '../platform/dedup.ts';
import type { Queue } from '../platform/queue.ts';
import type { FavouriteEntry } from '@mbd/core/types';

export interface RouteDeps {
  store: Store;
  queue: Queue;
  media: MediaStore;
  sse: SseHub;
  settings: () => DesktopSettings;
  setSettings: (s: DesktopSettings) => Promise<void>;
  navigate: (url: string) => void;
}

function lastSegment(url: URL): string {
  const segs = url.pathname.split('/');
  return decodeURIComponent(segs[segs.length - 1] ?? '');
}

export function buildRoutes(deps: RouteDeps): Record<string, ApiHandler> {
  return {
    'GET /api/media': () => Response.json({ items: deps.media.list() }),

    'POST /api/download': async (req) => {
      const { srcs } = (await req.json()) as { srcs: string[] };
      const items = srcs
        .map((src) => deps.media.get(src))
        .filter((it): it is NonNullable<typeof it> => it != null);
      let keep = items;
      let skipped: typeof items = [];
      if (deps.settings().skipDuplicateDownloads) {
        const keys = await downloadedKeysOnDisk(deps.store);
        ({ keep, skipped } = splitByDownloaded(items, keys));
      }
      await deps.queue.enqueue(keep);
      deps.sse.broadcast('queue', deps.queue.status());
      return Response.json({ queued: keep.length, skipped: skipped.length });
    },

    'GET /api/queue': () => Response.json(deps.queue.status()),

    'GET /api/settings': () => Response.json(deps.settings()),

    'PUT /api/settings': async (req) => {
      const body = (await req.json()) as Partial<DesktopSettings>;
      const merged = { ...deps.settings(), ...body };
      await deps.setSettings(merged);
      return Response.json(merged);
    },

    'GET /api/history': async () => Response.json({ items: await loadHistory(deps.store) }),

    'DELETE /api/history': async () => {
      await clearHistory(deps.store);
      return Response.json({ ok: true });
    },

    'DELETE /api/history/:key': async (_req, url) => {
      await removeHistoryEntry(deps.store, lastSegment(url));
      return Response.json({ ok: true });
    },

    'GET /api/favourites': async () => Response.json({ items: await loadFavourites(deps.store) }),

    'POST /api/favourites': async (req) => {
      const { item } = (await req.json()) as { item: FavouriteEntry };
      await addFavourite(deps.store, item);
      return Response.json({ ok: true });
    },

    'DELETE /api/favourites/:key': async (_req, url) => {
      await removeFavourite(deps.store, lastSegment(url));
      return Response.json({ ok: true });
    },

    'POST /api/navigate': async (req) => {
      const { url: target } = (await req.json()) as { url: string };
      deps.navigate(target);
      return Response.json({ ok: true });
    },
  };
}
