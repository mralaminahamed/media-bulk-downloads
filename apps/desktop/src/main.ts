/// <reference path="./deno-desktop.d.ts" />
import { basename } from 'jsr:@std/path';
import { downloadOne } from './platform/downloader.ts';
import { captureStream, streamQualityToEngine } from './platform/capture.ts';
import { openStore } from './storage/kv.ts';
import { COLLECTOR_IIFE } from './generated/collector-iife.ts';
import { OVERLAY_JS } from './overlay/overlay.ts';
import { createQueue } from './platform/queue.ts';
import { loadSettings, pickKnownSettings, saveSettings } from './storage/settings.ts';
import { clearHistory, loadHistory, recordDownloads, removeHistoryEntry, type StoredHistoryEntry } from './storage/history.ts';
import { addFavourite, favouriteKeys, loadFavourites, removeFavourite } from './storage/favourites.ts';
import type { FavouriteEntry } from '@mbd/core/types';
import { downloadedKeysOnDisk, splitByDownloaded } from './platform/dedup.ts';
import { startServer } from './server/server.ts';
import { buildRoutes, type ImportPayload } from './server/routes.ts';
import { createMediaStore, type CollectedItem } from './server/media-store.ts';
import { createSseHub } from './server/sse.ts';
import { DASHBOARD_ASSETS } from './generated/dashboard-assets.ts';
import { hostFromUrl, registrableDomain } from './core-bundle/download-name.gen.js';
import { DEEPSCAN_IIFE } from './generated/deepscan-iife.ts';
import { loadScanMemory, saveScanMemory } from './storage/scan-memory.ts';

const HOME = Deno.env.get('HOME') ?? '.';
const store = await openStore(`${HOME}/.mbd-desktop.kv`);
const root = Deno.env.get('MBD_DOWNLOAD_ROOT') ??
  (await store.durableGet<string>('downloadRoot')) ??
  `${HOME}/Downloads`;

let settings2 = await loadSettings(store);
const queue = createQueue({
  store,
  root,
  settings: () => settings2,
});

const win = new Deno.BrowserWindow({ title: 'Media Bulk Downloads — Browser', width: 1100, height: 780 });

// The infinite pump loop keeps Deno's event loop alive, so the process never
// exits on its own. The browsing window used to exit the app on close, but the
// dashboard window now owns app lifecycle (see `dash.onclose` below) — closing
// the browsing window just hides it so it can be reopened via navigation.
win.onclose = () => {
  win.hide();
};

let currentUrl = 'https://commons.wikimedia.org/wiki/Category:Vincent_van_Gogh';

// Dashboard backend: media store (collected items across pages) + SSE hub +
// REST routes, served by the local-only HTTP server. The dashboard window is
// the primary UI; it owns process lifecycle (see `dash.onclose` below).
async function exportData() {
  return {
    version: 1,
    settings: settings2,
    history: await loadHistory(store),
    favourites: await loadFavourites(store),
  };
}

async function importData(backup: ImportPayload): Promise<{ history: number; favourites: number }> {
  if (backup.history?.length) {
    await recordDownloads(store, backup.history as StoredHistoryEntry[]);
  }
  if (backup.favourites?.length) {
    for (const entry of backup.favourites as FavouriteEntry[]) {
      await addFavourite(store, entry);
    }
  }
  if (backup.settings) {
    settings2 = pickKnownSettings(settings2, backup.settings);
    await saveSettings(store, settings2);
  }
  return {
    history: (await loadHistory(store)).length,
    favourites: (await loadFavourites(store)).length,
  };
}

const media = createMediaStore();
const sse = createSseHub();
const routes = buildRoutes({
  store,
  queue,
  media,
  sse,
  settings: () => settings2,
  setSettings: async (s) => {
    settings2 = s;
    await saveSettings(store, s);
  },
  navigate: (url) => {
    void openAndInject(url);
  },
  showBrowser: () => {
    win.show();
    win.focus();
  },
  deepScan: () => {
    void runDeepScanFlow();
  },
  capture: (src) => {
    void runCaptureFlow(src);
  },
  exportData,
  importData,
});
const srv = await startServer({ assets: DASHBOARD_ASSETS, api: routes, sse: (req) => sse.handler(req) });

const dash = new Deno.BrowserWindow({ title: 'Media Bulk Downloads', width: 1180, height: 820 });
dash.onclose = () => Deno.exit(0);
dash.navigate(`http://127.0.0.1:${srv.port}/?token=${srv.token}`);

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
        template: settings2.downloadPath,
        namingMode: settings2.namingMode,
        fileNamePrefix: settings2.fileNamePrefix,
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
      const items = (JSON.parse(args[0]) as CollectedItem[]).filter((it) => !it.hlsManifest);
      let keep = items;
      let skipped: CollectedItem[] = [];
      if (settings2.skipDuplicateDownloads) {
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
        kind: item.kind,
        type: item.type ?? '',
        sourcePageUrl: item.sourcePage?.url ?? currentUrl,
        time: Date.now(),
      });
    }
    return !already;
  },

  getFavourites: () => loadFavourites(store),

  collect: (args) => {
    const items = JSON.parse(args[0]) as CollectedItem[];
    const added = media.merge(items);
    if (added.length) sse.broadcast('media-added', { added });
    return { added: added.length, total: media.list().length };
  },

  focusDashboard: () => {
    dash.focus();
    return null;
  },

  deepScan: () => {
    void runDeepScanFlow();
    return null;
  },

  capture: (args) => {
    void runCaptureFlow(args[0]);
    return null;
  },
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

// Mirrors the page-side shapes written by DEEPSCAN_IIFE's `__mbdDeepScan`
// (see src/collector/deepscan.entry.ts) — kept local so main.ts doesn't need a
// value-import of that browser-only entry module.
interface DeepScanProgress {
  found: number;
  scrolls: number;
  elapsedMs: number;
  reason?: string;
}

interface DeepScanResult {
  items: CollectedItem[];
  sample: { settleMs: number; scrolls: number } | null;
  reason: string;
}

let scanning = false;

// Deep-scan orchestration: inject the deep-scan bundle, dispatch
// `__mbdDeepScan(cfg)`, and poll the SAME two page-side markers it writes
// (`window.__mbdScanProgress`, `window.__mbdScanResult`) in one executeJs round
// trip per tick — same mark-then-poll recipe as `awaitPageValue`, just reading
// two markers instead of one so progress can be relayed over SSE as it arrives
// rather than only once at the end.
async function runDeepScanFlow(): Promise<void> {
  if (scanning) return;
  scanning = true;
  let lastProgress: DeepScanProgress | null = null;
  try {
    const host = registrableDomain(hostFromUrl(currentUrl));
    const mem = settings2.rememberScanBehaviour && host ? await loadScanMemory(store, host) : null;
    const seed = mem ? { settleMs: mem.settleMs, scrolls: mem.scrolls } : undefined;
    const cfg = {
      maxItems: settings2.deepScanMaxItems,
      maxMs: settings2.deepScanMaxSeconds * 1000,
      maxScrolls: settings2.deepScanMaxScrolls,
      clickLoadMore: settings2.deepScanClickLoadMore,
      seed,
      excludeHostId: 'mbd-overlay',
    };

    await win.executeJs(DEEPSCAN_IIFE);
    await win.executeJs('window.__mbdScanProgress = undefined; window.__mbdScanResult = undefined;');
    await win.executeJs(`void __mbdDeepScan(${JSON.stringify(cfg)})`);

    const start = performance.now();
    const safetyMs = cfg.maxMs + 15000;
    let lastProgressJson: string | undefined;
    let result: DeepScanResult | null = null;

    while (performance.now() - start < safetyMs) {
      const r = await win.executeJs<string>(
        'JSON.stringify({ p: window.__mbdScanProgress ?? null, done: window.__mbdScanResult ?? null })',
      );
      if (r?.ok && r.value) {
        let parsed: { p: DeepScanProgress | null; done: DeepScanResult | null } = { p: null, done: null };
        try {
          parsed = JSON.parse(r.value);
        } catch {
          // keep the empty parse; a malformed tick just gets retried next loop
        }
        if (parsed.p) {
          lastProgress = parsed.p;
          const pJson = JSON.stringify(parsed.p);
          if (pJson !== lastProgressJson) {
            lastProgressJson = pJson;
            sse.broadcast('scan-progress', parsed.p);
          }
        }
        if (parsed.done) {
          result = parsed.done;
          break;
        }
      }
      await new Promise((res) => setTimeout(res, 400));
    }

    if (!result) {
      console.log('[mbd] deep-scan: timed out waiting for result');
      sse.broadcast('scan-progress', {
        found: lastProgress?.found ?? 0,
        scrolls: lastProgress?.scrolls ?? 0,
        elapsedMs: lastProgress?.elapsedMs ?? 0,
        reason: 'timeout',
      });
      return;
    }

    const added = media.merge(result.items);
    if (added.length) sse.broadcast('media-added', { added });
    sse.broadcast('scan-progress', {
      found: result.items.length,
      scrolls: lastProgress?.scrolls ?? 0,
      elapsedMs: lastProgress?.elapsedMs ?? 0,
      reason: result.reason,
    });
    console.log(
      `[mbd] deep-scan: reason=${result.reason} found=${media.list().length} added=${added.length} scrolls=${lastProgress?.scrolls ?? 0}`,
    );

    if (settings2.rememberScanBehaviour && host && result.sample) {
      await saveScanMemory(store, host, result.sample, Date.now());
    }
  } catch (e) {
    console.log('[mbd] deep-scan err:', (e as Error).message);
    sse.broadcast('scan-progress', {
      found: lastProgress?.found ?? 0,
      scrolls: lastProgress?.scrolls ?? 0,
      elapsedMs: lastProgress?.elapsedMs ?? 0,
      reason: 'error',
    });
  } finally {
    scanning = false;
  }
}

const capturing = new Set<string>();

// Stream-capture orchestration: runs Task 2's captureStream for the
// media-store item at `src` (must carry an hlsManifest — plain images/videos
// aren't capturable), relays byte progress over SSE, and records the written
// file into history on success. Guarded per-src the same way runDeepScanFlow
// guards the whole flow with `scanning`, so a repeat click on the same item
// while it's in flight is a no-op rather than a duplicate capture.
async function runCaptureFlow(src: string): Promise<void> {
  if (capturing.has(src)) return;
  capturing.add(src);
  try {
    const item = media.get(src);
    if (!item || !item.hlsManifest) {
      console.log('[mbd] capture err: no capturable item for', src);
      sse.broadcast('capture-progress', { src, done: 0, total: 0, reason: 'error' });
      return;
    }

    const quality = streamQualityToEngine(settings2.streamQuality);
    let lastTotal = 0;
    const { path, bytes } = await captureStream(item, {
      root,
      quality,
      onProgress: (done, total) => {
        lastTotal = total;
        sse.broadcast('capture-progress', { src, done, total });
      },
    });

    await recordDownloads(store, [{
      src,
      filename: basename(path),
      kind: 'video',
      type: item.type ?? 'video/mp4',
      thumbnailSrc: item.thumbnailSrc,
      sourcePageUrl: item.sourcePage?.url ?? currentUrl,
      time: Date.now(),
      path,
    }]);
    console.log('[mbd] captured ->', path);
    const total = lastTotal || bytes;
    sse.broadcast('capture-progress', { src, done: total, total, reason: 'complete' });
  } catch (e) {
    console.log('[mbd] capture err:', (e as Error).message);
    sse.broadcast('capture-progress', { src, reason: 'error' });
  } finally {
    capturing.delete(src);
  }
}

async function openAndInject(url: string): Promise<void> {
  win.show();
  win.focus();
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

// Drain the page-side command queue once, in a SINGLE executeJs round-trip that
// also publishes queue status to `window.__mbdStatus`. Keeping this to one call
// per tick matters: executeJs runs on the webview's UI thread, so hammering it
// (the old 2-calls-every-150ms loop) starved the native window controls
// (close/minimize/maximize stopped responding). Response writes for commands
// that return a value happen only on demand (a click), not every tick.
// Returns true if any command was processed.
let lastQueueBroadcast: string | undefined;
async function drainOnce(): Promise<boolean> {
  const status = queue.status();
  const statusJson = JSON.stringify(status);
  if (statusJson !== lastQueueBroadcast) {
    lastQueueBroadcast = statusJson;
    sse.broadcast('queue', status);
  }
  const r = await win.executeJs<string>(
    '(() => { window.__mbdStatus = ' + statusJson +
      '; const q = (window.__mbdCmd || []); window.__mbdCmd = []; return JSON.stringify(q); })()',
  );
  if (!r?.ok || !r.value) return false;
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
  return cmds.length > 0;
}

// Adaptive cadence: poll briskly while the user is interacting or a download is
// in flight (status must stay live), and back off hard when idle so the UI
// thread is essentially free and native window controls stay responsive.
async function pumpLoop(): Promise<void> {
  let idleTicks = 0;
  for (;;) {
    let busy = false;
    try {
      const processed = await drainOnce();
      const s = queue.status();
      busy = processed || s.pending + s.active > 0;
    } catch (e) {
      console.log('[mbd] pump err:', (e as Error).message);
    }
    idleTicks = busy ? 0 : Math.min(idleTicks + 1, 10);
    await new Promise((res) => setTimeout(res, idleTicks > 5 ? 700 : 200));
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
