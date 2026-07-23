// Throwaway runtime spike: confirm the four Deno desktop primitives and record
// which navigation event fires (for re-injection). Console-observable.
const P = (label: string, v: unknown) => console.log(`[SPIKE] ${label}:`, v);

P("Deno.BrowserWindow typeof", typeof (Deno as unknown as { BrowserWindow?: unknown }).BrowserWindow);

const win = new Deno.BrowserWindow({ title: "mbd spike", width: 1000, height: 720 });

// Prototype introspection — confirm bind / executeJs / navigate exist.
try {
  const proto = Object.getPrototypeOf(win);
  P("BrowserWindow proto methods", Object.getOwnPropertyNames(proto));
} catch (e) {
  P("proto introspection err", (e as Error).message);
}

// (c) RPC binding round-trip: register a Deno-side handler the injected JS calls.
try {
  win.bind("ping", (arg: unknown) => {
    P("bind('ping') received", arg);
    return { pong: true, echo: arg };
  });
  P("win.bind registered", "ping");
} catch (e) {
  P("win.bind err", (e as Error).message);
}

// (d) Re-injection signal: probe every plausible navigation/load event name.
for (const ev of ["load", "did-navigate", "dom-ready", "navigate", "loaded", "ready", "did-finish-load"]) {
  try {
    win.addEventListener(ev, () => P("event fired", ev));
  } catch {
    P("addEventListener rejected event", ev);
  }
}

// (a) navigate to an external https site.
try {
  win.navigate("https://example.com/");
  P("navigate called", "https://example.com/");
} catch (e) {
  P("navigate err", (e as Error).message);
}

// (b) after load: executeJs returns a main-world value; then inject the collector
// IIFE and read the count; then have injected JS call the ping binding.
setTimeout(async () => {
  try {
    const title = await win.executeJs("document.title");
    P("executeJs document.title", title);
  } catch (e) {
    P("executeJs title err", (e as Error).message);
  }

  try {
    const code = await Deno.readTextFile(new URL("../dist/collector.iife.js", import.meta.url));
    await win.executeJs(code);
    const count = await win.executeJs(
      "JSON.stringify((globalThis.__mbdCollect ? globalThis.__mbdCollect() : []).length)",
    );
    P("collector injected; __mbdCollect count", count);
  } catch (e) {
    P("collector inject err", (e as Error).message);
  }

  try {
    // Injected JS calls the Deno-side binding via the `bindings` proxy.
    const roundtrip = await win.executeJs(
      "(async () => { try { const r = await bindings.ping('from-page'); return JSON.stringify(r); } catch (e) { return 'BINDINGS_ERR:' + (e && e.message); } })()",
    );
    P("bindings.ping round-trip result", roundtrip);
  } catch (e) {
    P("bindings round-trip err", (e as Error).message);
  }

  P("SPIKE COMPLETE", "ok");
}, 3500);
