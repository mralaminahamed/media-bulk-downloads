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

## RPC bindings (page → Deno) — WORKS

- Deno side: `win.bind('name', (arg) => { … })` (handler may be sync; JSON-encoded
  args/return; `Uint8Array` supported). `win.unbind('name')` to remove.
- Page side: `bindings.name(...args)` → Promise.
- **Verified:** injected page JS `bindings.ping('from-page')` invoked the Deno
  handler, which received `'from-page'`. This is the mechanism for the overlay's
  Download button → Deno `download` handler (fire-and-forget from the page; the
  handler does the work — no need to read the async result back via executeJs).

## No navigation/load event — poll `document.readyState`

The `on*` handlers are ONLY input/resize/move/close/menu. **There is NO
`onload` / `did-navigate` / `dom-ready` / navigation-complete event**, and no
`addEventListener('load', …)`. To know when a navigated page is ready to inject
into, **poll**:

```ts
async function waitReady(win, timeoutMs = 15000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const r = await win.executeJs("document.readyState");
    if (r?.ok && r.value === "complete") return true;
    await new Promise((res) => setTimeout(res, 150));
  }
  return false;
}
```

(For SPA client-side route changes there is likewise no event — re-poll or expose
a `bindings.mediaChanged()` the injected script calls, and re-inject on demand.)

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

## Task-7 wiring implications (summary)

1. Add an ambient `.d.ts` for `Deno.BrowserWindow` (or accept `--no-check` for the
   run task).
2. Embed the collector IIFE as a string (text-import or generated module), not a
   relative file read.
3. `navigate` → `waitReady()` (poll `document.readyState`) → `executeJs(COLLECTOR_IIFE)`
   → `executeJs(OVERLAY_JS)`; read results via `.value`.
4. `win.bind('download', handler)`; the overlay calls `bindings.download(itemJson)`
   fire-and-forget; the Deno handler runs `downloadOne`.
5. No load event: also expose a manual "Scan" affordance and/or poll for SPA route
   changes; do not assume an event will tell you when to re-inject.
