// Injected into the browsed page via executeJs (runs synchronously — no async
// return, per docs/runtime-recipe.md). Reads __mbdCollect(), renders a Shadow-DOM
// overlay, and wires the download/downloadAll/toggleFavourite/history bindings
// (all fire-and-forget from real DOM click handlers — the page keeps pumping,
// so calling `bindings.x(...)` without awaiting it still dispatches; only a
// binding call made *from inside an executeJs snippet* needs to be awaited).
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

  const starMarkup = first
    ? '<button id="star" title="Toggle favourite" style="cursor:pointer;border:none;background:none;font-size:16px;line-height:1;padding:0;color:#c8a400">☆</button>'
    : '';

  const bodyMarkup = first
    ? '<div style="margin:6px 0;word-break:break-all;opacity:.75">' + String(first.src).slice(0, 120) + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
      '<button id="dl" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #6366f1;background:#6366f1;color:#fff">Download #1</button>' +
      '<button id="dlAll" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #16a34a;background:#16a34a;color:#fff">Download all (' + items.length + ')</button>' +
      '<button id="histBtn" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #c8c8d0;background:#f2f2f5;color:#111">History</button>' +
      '</div>'
    : '<div style="margin:6px 0;opacity:.7">nothing to download here</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
      '<button id="histBtn" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #c8c8d0;background:#f2f2f5;color:#111">History</button>' +
      '</div>';

  root.innerHTML =
    '<div style="font:13px/1.4 system-ui,sans-serif;background:#fff;color:#111;border:1px solid #d0d0d8;border-radius:10px;padding:10px 12px;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.18)">' +
    '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">' +
    '<svg width="18" height="18" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex:none"><defs><linearGradient id="mbdmTile" x1="12" y1="6" x2="116" y2="122" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#818CF8"/><stop offset="1" stop-color="#4F46E5"/></linearGradient><clipPath id="mbdmPhoto"><rect x="35" y="23" width="58" height="41" rx="9"/></clipPath></defs><rect x="6" y="6" width="116" height="116" rx="28" fill="url(#mbdmTile)"/><rect x="30" y="17" width="58" height="41" rx="9" fill="#fff" opacity="0.28"/><rect x="35" y="23" width="58" height="41" rx="9" fill="#fff"/><g clip-path="url(#mbdmPhoto)"><circle cx="51" cy="38" r="6" fill="#4F46E5"/><path d="M39 64 L56 44 L68 56 L82 40 L98 64 Z" fill="#6366F1"/></g><g stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M64 74 V101"/><path d="M48 86 L64 103 L80 86"/></g></svg>' +
    '<b style="font-size:13px">Media Bulk Downloads</b>' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:8px">' +
    '<input id="addr" placeholder="https://…" style="flex:1;min-width:0;padding:4px 8px;border:1px solid #c8c8d0;border-radius:6px" />' +
    '<button id="go" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #c8c8d0;background:#f2f2f5;color:#111">Go</button>' +
    '</div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
    '<b>Found ' + items.length + ' media</b>' +
    starMarkup +
    '</div>' +
    bodyMarkup +
    '<div id="qstatus" style="opacity:.75;font-size:12px;margin-bottom:2px"></div>' +
    '<div id="histPanel" style="display:none;max-height:160px;overflow:auto;border-top:1px solid #eee;padding-top:6px"></div>' +
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

  const star = root.getElementById('star');
  if (star && first) {
    star.addEventListener('click', async () => {
      const favourited = await globalThis.bindings.toggleFavourite(JSON.stringify(first));
      star.textContent = favourited ? '★' : '☆';
    });
  }

  const dlAll = root.getElementById('dlAll');
  if (dlAll && items.length) {
    dlAll.addEventListener('click', () => {
      // fire-and-forget: the Deno-side downloadAll handler enqueues + dedups.
      globalThis.bindings.downloadAll(JSON.stringify(items));
      dlAll.textContent = 'Queued…';
    });
  }

  const qstatus = root.getElementById('qstatus');
  if (qstatus) {
    setInterval(async () => {
      const s = await globalThis.bindings.queueStatus();
      if (s) {
        qstatus.textContent =
          'pending ' + s.pending + ' · active ' + s.active + ' · done ' + s.done + ' · failed ' + s.failed;
      }
    }, 800);
  }

  const histBtn = root.getElementById('histBtn');
  const histPanel = root.getElementById('histPanel');
  const renderHistory = (list) => {
    histPanel.innerHTML = '';
    list.forEach((e) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 0;border-bottom:1px solid #f0f0f0';
      const label = document.createElement('span');
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
      label.textContent = e.filename || e.src;
      const rm = document.createElement('button');
      rm.textContent = '✕';
      rm.title = 'Remove from history';
      rm.style.cssText = 'cursor:pointer;border:none;background:none;color:#b91c1c;font-size:13px;padding:0 0 0 6px';
      rm.addEventListener('click', () => {
        globalThis.bindings.removeHistory(e.src);
        row.remove();
      });
      row.appendChild(label);
      row.appendChild(rm);
      histPanel.appendChild(row);
    });
  };
  if (histBtn && histPanel) {
    histBtn.addEventListener('click', async () => {
      const isOpen = histPanel.style.display !== 'none';
      if (isOpen) {
        histPanel.style.display = 'none';
        return;
      }
      const h = await globalThis.bindings.getHistory();
      renderHistory(h || []);
      histPanel.style.display = 'block';
    });
  }
})();
`;
