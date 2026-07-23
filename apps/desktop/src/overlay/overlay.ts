// Injected into the browsed page via executeJs (runs synchronously — no async
// return, per docs/runtime-recipe.md). Reads __mbdCollect(), renders a Shadow-DOM
// overlay, and on Download click calls the `download` binding (fire-and-forget).
export const OVERLAY_JS = String.raw`
(() => {
  const HOST_ID = 'mbd-overlay';
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  const items = (globalThis.__mbdCollect ? globalThis.__mbdCollect({ excludeHostId: HOST_ID }) : []);
  const first = items[0];
  root.innerHTML =
    '<div style="font:13px/1.4 system-ui,sans-serif;background:#fff;color:#111;border:1px solid #d0d0d8;border-radius:10px;padding:10px 12px;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.18)">' +
    '<div style="display:flex;gap:6px;margin-bottom:8px">' +
    '<input id="addr" placeholder="https://…" style="flex:1;min-width:0;padding:4px 8px;border:1px solid #c8c8d0;border-radius:6px" />' +
    '<button id="go" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #c8c8d0;background:#f2f2f5;color:#111">Go</button>' +
    '</div>' +
    '<b>Found ' + items.length + ' media</b>' +
    (first
      ? '<div style="margin:6px 0;word-break:break-all;opacity:.75">' + String(first.src).slice(0, 120) + '</div>' +
        '<button id="dl" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #6366f1;background:#6366f1;color:#fff">Download #1</button>'
      : '<div style="margin-top:6px;opacity:.7">nothing to download here</div>') +
    '</div>';

  const addr = root.getElementById('addr');
  const go = root.getElementById('go');
  const navigate = () => {
    const url = addr && addr.value && addr.value.trim();
    if (url) globalThis.bindings.navigateTo(url);
  };
  if (go) go.addEventListener('click', navigate);
  if (addr) addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });

  const btn = root.getElementById('dl');
  if (btn && first) {
    btn.addEventListener('click', () => {
      // fire-and-forget: the Deno-side download handler does the work.
      globalThis.bindings.download(JSON.stringify(first));
      btn.textContent = 'Downloading…';
    });
  }
})();
`;
