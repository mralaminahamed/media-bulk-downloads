/// <reference path="./deno-desktop.d.ts" />
import { downloadOne } from './platform/downloader.ts';
import { openStore } from './storage/kv.ts';
import { COLLECTOR_IIFE } from './collector/collector.generated.ts';
import { OVERLAY_JS } from './overlay/overlay.ts';

const HOME = Deno.env.get('HOME') ?? '.';
const store = await openStore(`${HOME}/.mbd-desktop.kv`);
const root = Deno.env.get('MBD_DOWNLOAD_ROOT') ??
  (await store.durableGet<string>('downloadRoot')) ??
  `${HOME}/Downloads`;

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

  // Optional smoke test (off by default): exercise the SHIPPED download path the
  // overlay button uses — the page calls the `download` binding, which the async
  // Deno handler fulfils. Gated behind MBD_AUTO_VERIFY so a normal browse never
  // writes a file unprompted.
  if (Deno.env.get('MBD_AUTO_VERIFY')) {
    // Await the binding inside the page (executeJs can't return the Promise, but
    // awaiting it dispatches the call and runs the async Deno handler). This is
    // the same `bindings.download` path the overlay button triggers.
    await win.executeJs(
      "(async () => { const xs = globalThis.__mbdCollect({ excludeHostId: 'mbd-overlay' }); if (xs[0]) await globalThis.bindings.download(JSON.stringify(xs[0])); })()",
    );
    await new Promise((res) => setTimeout(res, 2500));
  }
}

await openAndInject(currentUrl);
