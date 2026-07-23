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

let currentUrl = 'https://commons.wikimedia.org/wiki/Category:Vincent_van_Gogh';

// Page -> Deno command handlers. Each takes the JSON-string arg array the page
// pushed and returns a JSON-serialisable result (or null). The result is
// delivered back to the page via `window.__mbdRes[id]` by the pump loop below.
//
// Why a command queue instead of `win.bind`: the bind bridge does not resolve
// the page-side promise for ASYNC handlers, so `await bindings.getHistory()`
// (and every other awaited call) hangs forever. `executeJs` is the one channel
// that reliably round-trips, so the whole RPC rides on it. See
// docs/runtime-recipe.md.
const handlers: Record<string, (args: string[]) => unknown | Promise<unknown>> = {
  download: async (args) => {
    try {
      const item = JSON.parse(args[0]) as CollectedItem;
      const { path } = await downloadOne(item, {
        root,
        template: '{domain}',
        index: 0,
        sourcePageUrl: currentUrl,
      });
      console.log('[mbd] downloaded ->', path);
      return path;
    } catch (e) {
      console.log('[mbd] download err:', (e as Error).message);
      return null;
    }
  },

  navigateTo: (args) => {
    void openAndInject(args[0]);
    return null;
  },

  downloadAll: async (args) => {
    try {
      const items = JSON.parse(args[0]) as CollectedItem[];
      let keep = items;
      let skipped: CollectedItem[] = [];
      if (settings.skipDuplicateDownloads) {
        const keys = await downloadedKeysOnDisk(store);
        ({ keep, skipped } = splitByDownloaded(items, keys));
      }
      await queue.enqueue(keep);
      console.log(`[mbd] queued ${keep.length}, skipped ${skipped.length}`);
      return { queued: keep.length, skipped: skipped.length };
    } catch (e) {
      console.log('[mbd] downloadAll err:', (e as Error).message);
      return null;
    }
  },

  queueStatus: () => queue.status(),

  getHistory: () => loadHistory(store),

  removeHistory: async (args) => {
    await removeHistoryEntry(store, args[0]);
    return null;
  },

  clearHistory: async () => {
    await clearHistory(store);
    return null;
  },

  toggleFavourite: async (args) => {
    const item = JSON.parse(args[0]) as CollectedItem;
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
  },

  getFavourites: () => loadFavourites(store),
};

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
// await a returned Promise, so an async result can't be read off executeJs's own
// return. Instead: dispatch an async IIFE that, once settled, assigns the result
// to a page-side marker (`window.__mbdVerify`); a separate loop of plain
// synchronous executeJs reads poll that marker until it's set (or timeoutMs
// elapses) — the same mark-then-poll recipe navigateAndWait uses for navigation.
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
}

// Drain the page-side command queue once: pull every queued command, run its
// handler, deliver each result back to `window.__mbdRes[id]`, then publish the
// current queue status to `window.__mbdStatus` (the overlay reads it directly
// instead of making a round-trip call).
async function drainOnce(): Promise<void> {
  const r = await win.executeJs<string>(
    '(() => { const q = (window.__mbdCmd || []); window.__mbdCmd = []; return JSON.stringify(q); })()',
  );
  if (r?.ok && r.value) {
    let cmds: Array<{ id?: string; cmd: string; args?: string[] }> = [];
    try {
      cmds = JSON.parse(r.value);
    } catch {
      cmds = [];
    }
    for (const c of cmds) {
      let result: unknown = null;
      const h = handlers[c.cmd];
      if (h) {
        try {
          result = await h(c.args ?? []);
        } catch (e) {
          console.log('[mbd] cmd err', c.cmd, (e as Error).message);
        }
      }
      if (c.id) {
        await win.executeJs(
          '(window.__mbdRes = window.__mbdRes || {})[' + JSON.stringify(c.id) + '] = ' +
            JSON.stringify(result ?? null),
        );
      }
    }
  }
  await win.executeJs('window.__mbdStatus = ' + JSON.stringify(queue.status()));
}

async function pumpLoop(): Promise<void> {
  for (;;) {
    try {
      await drainOnce();
    } catch (e) {
      console.log('[mbd] pump err:', (e as Error).message);
    }
    await new Promise((res) => setTimeout(res, 150));
  }
}

await openAndInject(currentUrl);
void pumpLoop();

// Transport self-test (off by default): push a request-style command into the
// page queue exactly as a real button click does, and confirm the pump loop
// dispatches it and delivers a response back through __mbdRes. Proves the whole
// page -> Deno -> page round-trip without a human click.
if (Deno.env.get('MBD_SELFTEST')) {
  const probe = await awaitPageValue<
    { ok: boolean; downloadPath: unknown; historyLen: number }
  >(
    `(async () => {
      (window.__mbdRes = window.__mbdRes || {});
      window.__mbdCmd = window.__mbdCmd || [];
      const wait = (id) => new Promise((res) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (Object.prototype.hasOwnProperty.call(window.__mbdRes, id)) {
            clearInterval(iv); const v = window.__mbdRes[id]; delete window.__mbdRes[id]; res(v);
          } else if (Date.now() - t0 > 12000) { clearInterval(iv); res('__timeout'); }
        }, 120);
      });
      const push = (cmd, args) => {
        const id = 'st-' + cmd + '-' + Date.now();
        window.__mbdCmd.push({ id: id, cmd: cmd, args: args });
        return id;
      };
      const xs = (globalThis.__mbdCollect ? globalThis.__mbdCollect({ excludeHostId: 'mbd-overlay' }) : []);
      let downloadPath = null;
      if (xs[0]) downloadPath = await wait(push('download', [JSON.stringify(xs[0])]));
      const hist = await wait(push('getHistory', []));
      window.__mbdVerify = {
        ok: true,
        downloadPath: downloadPath,
        historyLen: Array.isArray(hist) ? hist.length : -1,
      };
    })()`,
    16000,
  );
  console.log('[mbd] selftest transport ->', JSON.stringify(probe));
}
