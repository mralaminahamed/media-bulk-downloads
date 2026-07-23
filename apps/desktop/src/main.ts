/// <reference path="./deno-desktop.d.ts" />
import { downloadOne } from './platform/downloader.ts';
import { openStore } from './storage/kv.ts';
import { COLLECTOR_IIFE } from './collector/collector.generated.ts';
import { OVERLAY_JS } from './overlay/overlay.ts';
import { createQueue } from './platform/queue.ts';
import { loadSettings } from './storage/settings.ts';
import { clearHistory, loadHistory, removeHistoryEntry } from './storage/history.ts';
import { addFavourite, favouriteKeys, loadFavourites, removeFavourite } from './storage/favourites.ts';
import { downloadedKeysOnDisk, splitByDownloaded } from './platform/dedup.ts';

interface CollectedItem {
  src: string;
  ext?: string;
  type?: string;
  kind?: 'image' | 'video' | 'audio';
  sourcePage?: { url?: string };
}

const HOME = Deno.env.get('HOME') ?? '.';
const store = await openStore(`${HOME}/.mbd-desktop.kv`);
const root = Deno.env.get('MBD_DOWNLOAD_ROOT') ??
  (await store.durableGet<string>('downloadRoot')) ??
  `${HOME}/Downloads`;

const settings = await loadSettings(store);
const queue = createQueue({
  store,
  root,
  template: settings.downloadPath,
  namingMode: settings.namingMode,
  fileNamePrefix: settings.fileNamePrefix,
  concurrency: settings.downloadConcurrency,
});

const win = new Deno.BrowserWindow({ title: 'Media Bulk Downloads', width: 1100, height: 780 });

win.bind('download', async (...args: never[]) => {
  try {
    const item = JSON.parse(args[0] as string);
    const { path } = await downloadOne(item, { root, template: '{domain}', index: 0, sourcePageUrl: currentUrl });
    console.log('[mbd] downloaded ->', path);
    return path;
  } catch (e) {
    console.log('[mbd] download err:', (e as Error).message);
    throw e;
  }
});

win.bind('navigateTo', (...args: never[]) => {
  void openAndInject(args[0] as string);
});

win.bind('downloadAll', async (...args: never[]) => {
  try {
    const items = JSON.parse(args[0] as string) as CollectedItem[];
    let keep = items;
    let skipped: CollectedItem[] = [];
    if (settings.skipDuplicateDownloads) {
      const keys = await downloadedKeysOnDisk(store);
      ({ keep, skipped } = splitByDownloaded(items, keys));
    }
    await queue.enqueue(keep);
    console.log(`[mbd] queued ${keep.length}, skipped ${skipped.length}`);
  } catch (e) {
    console.log('[mbd] downloadAll err:', (e as Error).message);
  }
});

win.bind('queueStatus', (..._args: never[]) => {
  try {
    return queue.status();
  } catch (e) {
    console.log('[mbd] queueStatus err:', (e as Error).message);
  }
});

win.bind('getHistory', async (..._args: never[]) => {
  try {
    return await loadHistory(store);
  } catch (e) {
    console.log('[mbd] getHistory err:', (e as Error).message);
  }
});

win.bind('removeHistory', async (...args: never[]) => {
  try {
    await removeHistoryEntry(store, args[0] as string);
  } catch (e) {
    console.log('[mbd] removeHistory err:', (e as Error).message);
  }
});

win.bind('clearHistory', async (..._args: never[]) => {
  try {
    await clearHistory(store);
  } catch (e) {
    console.log('[mbd] clearHistory err:', (e as Error).message);
  }
});

win.bind('toggleFavourite', async (...args: never[]) => {
  try {
    const item = JSON.parse(args[0] as string) as CollectedItem;
    const already = (await favouriteKeys(store)).has(item.src);
    if (already) {
      await removeFavourite(store, item.src);
    } else {
      await addFavourite(store, {
        src: item.src,
        kind: item.kind ?? 'image',
        type: item.type ?? '',
        sourcePageUrl: item.sourcePage?.url ?? currentUrl,
        time: Date.now(),
      });
    }
    return !already;
  } catch (e) {
    console.log('[mbd] toggleFavourite err:', (e as Error).message);
  }
});

win.bind('getFavourites', async (..._args: never[]) => {
  try {
    return await loadFavourites(store);
  } catch (e) {
    console.log('[mbd] getFavourites err:', (e as Error).message);
  }
});

let currentUrl = 'https://commons.wikimedia.org/wiki/Category:Vincent_van_Gogh';

// There is no navigation/load event (see docs/runtime-recipe.md), and
// readyState is 'complete' for the OUTGOING document the instant after
// navigate(), so polling readyState alone races the stale page. Mark the current
// document, navigate, then poll until the marker is gone (= the new document
// committed) AND it has finished loading.
async function navigateAndWait(url: string, timeoutMs = 20000): Promise<boolean> {
  await win.executeJs('window.__mbdNavMark = true');
  win.navigate(url);
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const r = await win.executeJs<boolean>(
      "typeof window.__mbdNavMark === 'undefined' && document.readyState === 'complete'",
    );
    if (r?.ok && r.value === true) return true;
    await new Promise((res) => setTimeout(res, 150));
  }
  return false;
}

// executeJs is synchronous-eval only (see docs/runtime-recipe.md): it does NOT
// await a returned Promise, so an async binding's resolved value can't be read
// off executeJs's own return. Instead: dispatch an async IIFE that awaits the
// binding(s) and, once settled, assigns the result to a page-side marker
// (`window.__mbdVerify`); a separate loop of plain synchronous executeJs reads
// polls that marker until it's set (or timeoutMs elapses) — the same
// mark-then-poll recipe navigateAndWait already uses for navigation.
async function awaitPageValue<T>(dispatchCode: string, timeoutMs: number): Promise<T | undefined> {
  await win.executeJs('window.__mbdVerify = undefined');
  await win.executeJs(dispatchCode);
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const r = await win.executeJs<{ ready: boolean; value: T }>(
      "(typeof window.__mbdVerify !== 'undefined' ? { ready: true, value: window.__mbdVerify } : { ready: false, value: null })",
    );
    if (r?.ok && r.value?.ready) return r.value.value;
    await new Promise((res) => setTimeout(res, 200));
  }
  return undefined;
}

async function openAndInject(url: string): Promise<void> {
  currentUrl = url;
  const ready = await navigateAndWait(url);
  console.log('[mbd] page ready:', ready, url);
  await win.executeJs(COLLECTOR_IIFE);
  await win.executeJs(OVERLAY_JS);

  const count = await win.executeJs<number>(
    "(globalThis.__mbdCollect ? globalThis.__mbdCollect({ excludeHostId: 'mbd-overlay' }).length : 0)",
  );
  console.log('[mbd] collected count:', count?.value);

  // Optional smoke test (off by default): exercise the SHIPPED queue/history/
  // favourites path the overlay buttons use — the page calls the bindings
  // (awaited, so the calls genuinely dispatch), which the async Deno handlers
  // fulfil. Gated behind MBD_AUTO_VERIFY so a normal browse never queues
  // downloads or mutates KV state unprompted.
  if (Deno.env.get('MBD_AUTO_VERIFY')) {
    type QueueStatus = { pending: number; active: number; done: number; failed: number };

    const queueResult = await awaitPageValue<QueueStatus | null>(
      `(async () => {
        const xs = (globalThis.__mbdCollect ? globalThis.__mbdCollect({ excludeHostId: 'mbd-overlay' }).slice(0, 3) : []);
        if (!xs.length) { window.__mbdVerify = null; return; }
        await globalThis.bindings.downloadAll(JSON.stringify(xs));
        const want = xs.length;
        const t0 = Date.now();
        let s = await globalThis.bindings.queueStatus();
        while (Date.now() - t0 < 15000 && (s.done + s.failed) < want) {
          await new Promise((r) => setTimeout(r, 300));
          s = await globalThis.bindings.queueStatus();
        }
        window.__mbdVerify = s;
      })()`,
      16000,
    );
    console.log('[mbd] verify: downloadAll + queueStatus ->', JSON.stringify(queueResult));

    const favHistResult = await awaitPageValue<
      { favourited: boolean | null; favourites: number; history: number }
    >(
      `(async () => {
        const xs = (globalThis.__mbdCollect ? globalThis.__mbdCollect({ excludeHostId: 'mbd-overlay' }) : []);
        let favourited = null;
        if (xs[0]) favourited = await globalThis.bindings.toggleFavourite(JSON.stringify(xs[0]));
        const favourites = await globalThis.bindings.getFavourites();
        const history = await globalThis.bindings.getHistory();
        window.__mbdVerify = { favourited: favourited, favourites: favourites.length, history: history.length };
      })()`,
      5000,
    );
    console.log('[mbd] verify: toggleFavourite + favourites/history ->', JSON.stringify(favHistResult));
  }
}

await openAndInject(currentUrl);
