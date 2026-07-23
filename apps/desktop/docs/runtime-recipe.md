# Deno desktop runtime recipe (verified)

Confirmed empirically on **deno 2.9.3, aarch64-apple-darwin**, webview backend
**laufey 0.5.0**, by running `apps/desktop/src/spike.ts`. This is the source of
truth for wiring the vertical slice (Task 7).

> `deno desktop` prints `⚠ deno desktop is experimental and subject to change` —
> treat every signature here as pinned to 2.9.3.

## Running

- **Dev run (opens the window, streams `console.log` to stdout):**
  `deno desktop --hmr --no-check -A src/main.ts`
  Without `--hmr` (and without `--output`), `deno desktop <script>` **builds a
  `.app` bundle into the cwd and exits** — it does NOT run. Use `--hmr` to run.
- **Build an artifact:** `deno desktop --output 'Media Bulk Downloads.app' src/main.ts`
  (also `.dmg`/`.AppImage`/`.deb`/`.rpm`/`.msi`).
- Permissions: `-A` (or granular `-R`/`-W`); `--allow-scripts` for npm lifecycle.

## Types

`Deno.BrowserWindow` is a **runtime global with NO ambient TypeScript type** —
`typeof Deno.BrowserWindow === 'function'` at runtime, but `deno check` fails with
`TS2339: Property 'BrowserWindow' does not exist on type 'typeof Deno'`.

- Quick path: run with `--no-check`.
- Proper path (so `deno check` stays green for `main.ts`): ship a minimal ambient
  declaration, e.g. `apps/desktop/src/deno-desktop.d.ts` declaring
  `namespace Deno { class BrowserWindow { … } }` with the methods below.

## `Deno.BrowserWindow` surface (from prototype introspection)

```
constructor, windowId, bind, unbind, setTitle, getSize, setSize,
getPosition, setPosition, isResizable, setResizable, isAlwaysOnTop,
setAlwaysOnTop, getOpacity, setOpacity, isClosed, close, isVisible,
show, hide, focus, navigate, openDevtools, reload, executeJs,
setApplicationMenu, showContextMenu, getNativeWindow,
onkeydown, onkeyup, onmousedown, onmouseup, onclick, ondblclick,
onmousemove, onwheel, onmouseenter, onmouseleave, onfocus, onblur,
onresize, onmove, onclose, onmenuclick, oncontextmenuclick
```

Construct: `new Deno.BrowserWindow({ title, width, height })`.

## navigate + executeJs

- `win.navigate('https://example.com/')` — loads **arbitrary external https**. ✓
- `await win.executeJs('document.title')` → **`{ ok: true, value: "Example Domain" }`**.
  - **executeJs returns a wrapper `{ ok: boolean, value: T }`, not the raw value** —
    always read `.value`. On failure: `{ ok: false, value: <message> }`.
  - **executeJs does NOT support a Promise / async result.** Running
    `(async () => { … })()` yields
    `{ ok: false, value: "JavaScript execution returned a result of an unsupported type" }`.
    Use **synchronous** expressions, or fire-and-forget side effects.

## RPC bindings (page → Deno) — PARTIAL, do NOT rely on

- Deno side: `win.bind('name', (arg) => { … })`; page side `bindings.name(...args)`
  → Promise. `win.unbind('name')` to remove.
- **Only a SYNC, fire-and-forget bind works.** Verified: `bindings.ping('from-page')`
  (sync handler) invoked the Deno handler.
- **An ASYNC handler's page-side promise never resolves** — `await bindings.getHistory()`
  (and every other awaited call) hangs forever. Confirmed on the P1 Download button
  and the P2 overlay (downloadAll/queueStatus/toggleFavourite/getHistory all failed).
- **Therefore the app does NOT use `win.bind`.** The page → Deno channel is a command
  queue over `executeJs` (the one reliable primitive): the page pushes
  `{ id, cmd, args }` onto `window.__mbdCmd`; a Deno pump loop drains it every ~150ms
  via `executeJs`, runs the handler, writes the result to `window.__mbdRes[id]`, and
  publishes queue status to `window.__mbdStatus`. `send()` is fire-and-forget; `call()`
  polls `__mbdRes[id]` for the response. See `main.ts` (`drainOnce`/`pumpLoop`) and
  `overlay.ts`. Run once with `MBD_SELFTEST=1` to self-verify the round-trip.

## `executeJs` runs on the UI thread — do NOT poll it hard

`executeJs` executes on the webview's UI/main thread. A tight poll loop (the
first cut did 2 calls every 150ms, forever) **starves the native window
controls** — minimize/maximize/close stop responding. Keep the pump to ONE
combined `executeJs` per tick (drain commands + publish `window.__mbdStatus`
in a single eval) and back off when idle (200ms while interacting / a download
is in flight, 700ms idle). Verify against a bare window with no pump: its
traffic-light buttons work, so any control lag is your loop.

## Two windows, one lifecycle owner

An infinite pump loop keeps Deno's event loop alive, so the process never exits
on its own: the native **close** button tears down a window but the app
lingers unless something calls `Deno.exit`. With two windows (browsing `win` +
dashboard `dash`), the **dashboard** owns process lifecycle — wire
`dash.onclose = () => Deno.exit(0)`. The **browser** window's close just hides
it (`win.onclose = () => win.hide()`); it's brought back with `win.show()` +
`win.focus()` at the top of `openAndInject`, so navigating from the dashboard
(`POST /api/navigate`) re-shows it.

## No navigation/load event — use a SENTINEL, not a bare readyState poll

The `on*` handlers are ONLY input/resize/move/close/menu. **There is NO
`onload` / `did-navigate` / `dom-ready` / navigation-complete event**, and no
`addEventListener('load', …)`.

**VERIFIED GOTCHA:** right after `navigate(url)`, `document.readyState` is already
`'complete'` **for the OUTGOING document**, so a bare readyState poll returns
instantly against the stale page and `executeJs` runs against the old DOM.
(Observed: navigating to 3 URLs in sequence, each followed by a readyState poll,
left `executeJs` seeing the first page's DOM all three times.) A single navigate
with a fixed multi-second delay happens to work, but the robust fix is a
**sentinel**: mark the current document, navigate, then poll until the marker is
GONE (⇒ a new document committed) AND it has finished loading:

```ts
async function navigateAndWait(win, url, timeoutMs = 20000) {
  await win.executeJs("window.__mbdNavMark = true");   // mark outgoing doc
  win.navigate(url);
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const r = await win.executeJs(
      "typeof window.__mbdNavMark === 'undefined' && document.readyState === 'complete'",
    );
    if (r?.ok && r.value === true) return true;         // marker gone + loaded ⇒ new doc ready
    await new Promise((res) => setTimeout(res, 150));
  }
  return false;
}
```

(For SPA client-side route changes there is likewise no event — re-poll or expose
a `bindings.mediaChanged()` the injected script calls, and re-inject on demand.)

## Backend CANNOT import `@mbd/core` source — pre-bundle it

**VERIFIED BLOCKER:** `deno check`/`deno test` resolve bare `@mbd/core/*` source
imports (via the deno.json import map + `sloppy-imports`), but the **`deno desktop`
compile step does NOT** — it resolves relative import-map entries *relative to the
importing file* (`../../packages/core/src/` from `src/platform/downloader.ts`
became `apps/desktop/packages/core/src/…`, wrong base) and does not apply
sloppy-imports (no `.ts` extension), so the first `@mbd/core` value-import into a
desktop-compiled module fails with `Module not found`.

Fix (same "embed, don't resolve at runtime" principle as the collector): **pre-bundle
the backend's `@mbd/core` value-imports** into a self-contained ESM the backend
imports by RELATIVE path. `apps/desktop/src/core-bundle/build` Vite-bundles
`export { buildDownloadFilename } from '@mbd/core/collection/download-name'` (Vite
resolves `@mbd/core` via node_modules + package `exports`) into
`src/core-bundle/download-name.gen.js` (gitignored, built by `build:collector`);
`downloader.ts` imports `buildDownloadFilename` from that file.
**`import type` from `@mbd/core/types` is fine** — type-only imports erase at
runtime, so they need no runtime resolution. `jsr:` imports (e.g. `@std/path`) are
fine too — `deno desktop` fetches/embeds remote modules.

## Locating the collector IIFE — embed, don't relative-read

Under `deno desktop`, `import.meta.url` resolves into a **temp compile dir**
(`/var/folders/.../T/deno-compile-laufey_webview/…`), so
`new URL('../dist/collector.iife.js', import.meta.url)` → `path not found`. The
built IIFE is not beside the running module. Options for Task 7:

- **Text import** (preferred): `import collectorCode from './collector.iife.js' with { type: 'text' }`
  so the bundle is embedded in the app at build time. (Requires building the IIFE
  to a stable path the import can reference; verify `with { type: 'text' }` is
  honored by `deno desktop`'s bundler — fall back to inlining a generated
  `collector.ts` that `export const COLLECTOR = "…"`.)
- Or generate `src/collector/collector.generated.ts` (`export const COLLECTOR_IIFE = <string>`)
  from `build-collector.ts` and import that.

Do NOT rely on reading `dist/collector.iife.js` at runtime via a relative path.

## Task-7 wiring — VERIFIED working end-to-end

Slice confirmed: navigate to a Commons category → `navigateAndWait` (sentinel) →
inject collector → **256 media collected** → `downloadOne` wrote a real 1679-byte
file to `<root>/wikimedia.org/image_1.svg`. The recipe below is what actually works:

1. Add an ambient `src/deno-desktop.d.ts` for `Deno.BrowserWindow` so `deno check`
   passes; the run/build tasks also pass `--no-check` (the desktop compiler's type
   env differs).
2. Embed the collector IIFE as a **generated string module** (`build:collector`
   emits `collector.generated.ts` exporting `COLLECTOR_IIFE`), not a relative file
   read — `import.meta.url` points into a temp compile dir at runtime.
3. Pre-bundle backend `@mbd/core` value-imports into `core-bundle/download-name.gen.js`
   (imported by relative path); keep `@mbd/core/types` as `import type`.
4. `navigateAndWait(url)` (sentinel, above) → `executeJs(COLLECTOR_IIFE)` →
   `executeJs(OVERLAY_JS)`; read every result via `.value`.
5. Command queue over `executeJs` (NOT `win.bind`, which hangs on async handlers):
   the overlay pushes `{id,cmd,args}` to `window.__mbdCmd`; the Deno `pumpLoop`
   drains it, runs the handler (e.g. `download` → `downloadOne`), and writes the
   result to `window.__mbdRes[id]`.
6. No load event: expose a manual affordance and/or re-poll for SPA route changes;
   never assume an event signals when to re-inject.
