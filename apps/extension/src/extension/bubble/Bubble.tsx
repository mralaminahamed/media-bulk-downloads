import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BubbleCorner, BubblePanelPlacement, DeepScanProgress, ImageInfo, SettingsData, SettingsChangedMessage } from '@mbd/core/types';
import { withDefaults } from '@mbd/storage/settings';
import { overrideForHost, applyHostOverride } from '@mbd/storage/per-host-settings';
import { registrableDomain } from '@mbd/core/collection/paths';
import { collectMedia } from '@/extension/content/collect';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { ensureShopifyProduct } from '@/extension/content/shopify-product';
import App from '@/extension/popup/App';
import { BrandMark } from '@/extension/components/BrandMark';

interface BubbleProps {
  initialSettings: SettingsData;
}

const FAB = 48;
const EDGE = 8;
/** Gap between the launcher button and an anchored panel. */
const GAP = 10;
/** Margin from the viewport edge when the panel is pinned to a corner. */
const PANEL_MARGIN = 16;
/** Pointer travel (px) that separates an intentional drag from a click's jitter. */
const DRAG_THRESHOLD = 6;
/** Lower bounds for the panel. The upper bound is the live viewport (below). */
const MIN_W = 320;
const MIN_H = 360;

/**
 * Largest panel that fits the current window for a given placement — so a big
 * screen allows a big panel, and a small one is capped to what's visible.
 * Mirrors the reserve used by panelPlacementStyle for each placement.
 */
function maxPanelSize(
  placement: BubblePanelPlacement,
  pos: { x: number; y: number },
): { w: number; h: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const reserveV =
    placement === 'anchored'
      ? pos.y + FAB + GAP + EDGE
      : placement === 'center' || placement === 'free'
        ? EDGE * 2
        : PANEL_MARGIN * 2;
  return {
    w: Math.max(MIN_W, vw - EDGE * 2),
    h: Math.max(MIN_H, vh - reserveV),
  };
}

/**
 * Which panel edges are free to grow (not pinned) for the current placement.
 * The resize grip lives on the free corner so dragging it enlarges the panel
 * toward the pointer regardless of where the panel is anchored.
 */
function panelFreeEdges(
  placement: BubblePanelPlacement,
  corner: BubbleCorner,
): { freeRight: boolean; freeBottom: boolean } {
  if (placement === 'free' || placement === 'center') return { freeRight: true, freeBottom: true };
  const c = placement === 'anchored' ? corner : placement;
  return { freeRight: c.endsWith('left'), freeBottom: c.startsWith('top') };
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Fixed-position style anchoring an element to a corner with an offset. */
function anchorStyle(corner: BubbleCorner, x: number, y: number): React.CSSProperties {
  const s: React.CSSProperties = { position: 'fixed', zIndex: 2147483647 };
  if (corner.startsWith('top')) s.top = y;
  else s.bottom = y;
  if (corner.endsWith('left')) s.left = x;
  else s.right = x;
  return s;
}

/**
 * Full style for the panel given its placement, the button's corner/position,
 * and the desired size. Kept independent of the button so opening never moves it.
 */
function panelPlacementStyle(
  placement: BubblePanelPlacement,
  corner: BubbleCorner,
  pos: { x: number; y: number },
  size: { w: number; h: number },
  point: { x: number; y: number },
): React.CSSProperties {
  const width = `min(${size.w}px, calc(100vw - ${EDGE * 2}px))`;
  const viewportHeight = `min(${size.h}px, calc(100vh - ${EDGE * 2}px))`;

  if (placement === 'center') {
    return {
      position: 'fixed',
      zIndex: 2147483647,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width,
      height: viewportHeight,
    };
  }

  if (placement === 'free') {
    // A custom point the user dragged the header to.
    return { position: 'fixed', zIndex: 2147483647, top: point.y, left: point.x, width, height: viewportHeight };
  }

  if (placement === 'anchored') {
    // Sit beside the button at the same corner; reserve the button's footprint.
    const height = `min(${size.h}px, calc(100vh - ${pos.y + FAB + GAP + EDGE}px))`;
    return { ...anchorStyle(corner, pos.x, pos.y + FAB + GAP), width, height };
  }

  // Pinned to a specific viewport corner, independent of the button.
  const height = `min(${size.h}px, calc(100vh - ${PANEL_MARGIN * 2}px))`;
  return { ...anchorStyle(placement, PANEL_MARGIN, PANEL_MARGIN), width, height };
}

const Bubble: React.FC<BubbleProps> = ({ initialSettings }) => {
  const [open, setOpen] = useState(false);
  const [corner, setCorner] = useState<BubbleCorner>(initialSettings.bubblePosition.corner);
  const [pos, setPos] = useState({ x: initialSettings.bubblePosition.x, y: initialSettings.bubblePosition.y });
  const [size, setSize] = useState({ w: initialSettings.bubbleWidth, h: initialSettings.bubbleHeight });
  const [placement, setPlacement] = useState<BubblePanelPlacement>(initialSettings.bubblePanelPlacement);
  const [panelPoint, setPanelPoint] = useState({ x: initialSettings.bubblePanelPoint.x, y: initialSettings.bubblePanelPoint.y });
  const [grabbing, setGrabbing] = useState(false);

  const dragging = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const moved = useRef(0);

  // Latest GLOBAL settings, refreshed by the sync listener below, so a deep scan
  // started after the user edits the caps honours the new values rather than the
  // frozen mount-time snapshot. (Global only — Safari content scripts can't read
  // chrome.storage.sync, so the background broadcasts them via SETTINGS_CHANGED.)
  const settingsRef = useRef(initialSettings);
  // Global + this host's per-host override (#293), kept current so the bubble's
  // collect + deep scan honour a per-host override exactly like the popup path.
  // The per-host layer lives in chrome.storage.local (readable in a content script
  // on every browser); the global layer comes from settingsRef (the broadcast).
  const effectiveRef = useRef(initialSettings);
  const refreshEffective = useCallback(async (): Promise<void> => {
    try {
      const override = await overrideForHost(registrableDomain(location.hostname));
      effectiveRef.current = applyHostOverride(settingsRef.current, override);
    } catch {
      effectiveRef.current = settingsRef.current;
    }
  }, []);
  useEffect(() => { void refreshEffective(); }, [refreshEffective]);

  // Collect using the effective settings so `smartPageDefaults` (hero-first order)
  // and `resolveOriginals` (gallery-page pending items) apply in the bubble too —
  // the popup path passes these; without them both settings were dead no-ops here.
  const collectLocal = useCallback(async (): Promise<ImageInfo[]> => {
    const s = effectiveRef.current;
    // Prime the Shopify store (same-origin /products/<handle>.js) before the
    // synchronous collectMedia — the bubble collects in-page, so it doesn't go
    // through the content GET_IMAGES prelude that primes it for the popup path.
    await ensureShopifyProduct(location.href);
    return collectMedia(undefined, { smartPageDefaults: s.smartPageDefaults, resolveOriginals: s.resolveOriginals });
  }, []);

  // Deep scan runs in-page here (no messaging); track the in-flight controller so
  // the Stop button can abort it.
  const deepScanAbortRef = useRef<AbortController | null>(null);
  const deepScanLocal = useCallback(async (onProgress: (p: DeepScanProgress) => void): Promise<ImageInfo[]> => {
    const ac = new AbortController();
    deepScanAbortRef.current = ac;
    const s = effectiveRef.current;
    // Prime the Shopify store once before the scan's synchronous per-scroll
    // collectMedia calls (ac is already set, so Stop can abort during this).
    await ensureShopifyProduct(location.href);
    return startDeepScan(
      (found, scrolls, elapsedMs, reason) => {
        const p: DeepScanProgress = { type: 'DEEP_SCAN_PROGRESS', found, scrolls, elapsedMs };
        if (reason) p.reason = reason;
        onProgress(p);
      },
      ac.signal,
      // Honour the user's configured caps + Load-more toggle, same as the popup path.
      {
        maxItems: s.deepScanMaxItems,
        maxMs: s.deepScanMaxSeconds * 1000,
        maxScrolls: s.deepScanMaxScrolls,
        clickLoadMore: s.deepScanClickLoadMore,
        rememberScanBehaviour: s.rememberScanBehaviour,
      },
    );
  }, []);
  const abortDeepScanLocal = useCallback(() => {
    deepScanAbortRef.current?.abort();
  }, []);

  // Free-drag of the panel via its header.
  const panelRef = useRef<HTMLDivElement>(null);
  const panelDrag = useRef<{ sx: number; sy: number; left: number; top: number; w: number; h: number } | null>(null);

  // Keep corner/position/size in sync when settings change elsewhere (the popup,
  // or the same bubble on another tab). Driven by the background's SETTINGS_CHANGED
  // broadcast, not chrome.storage.onChanged: Safari content scripts don't receive
  // sync storage events, so a storage listener here would never fire there.
  useEffect(() => {
    const listener = (message: unknown) => {
      if (
        typeof message !== 'object' ||
        message === null ||
        (message as { type?: string }).type !== 'SETTINGS_CHANGED'
      ) {
        return;
      }
      const next = withDefaults((message as SettingsChangedMessage).settings);
      settingsRef.current = next; // keep deep-scan caps + Load-more toggle live
      void refreshEffective(); // re-layer this host's per-host override over the new global
      setCorner(next.bubblePosition.corner);
      setPos({ x: next.bubblePosition.x, y: next.bubblePosition.y });
      setSize({ w: next.bubbleWidth, h: next.bubbleHeight });
      setPlacement(next.bubblePanelPlacement);
      setPanelPoint({ x: next.bubblePanelPoint.x, y: next.bubblePanelPoint.y });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refreshEffective]);

  // Toolbar-icon clicks (when the popup is disabled) toggle the panel.
  useEffect(() => {
    const listener = (message: unknown) => {
      if (message === 'TOGGLE_BUBBLE') setOpen((o) => !o);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Close the panel on Escape — but only when no modal sub-dialog (Settings,
  // History, preview) is open inside it. This listener is on window/capture and
  // would otherwise fire before the sub-dialog's own Escape handler and collapse
  // the whole panel instead of just the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Let a sub-surface handle Escape first instead of collapsing the whole
      // panel: an open modal (preview/side panels), an open dropdown menu (the
      // download options), or a focused text field (clear the search box).
      if (panelRef.current?.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return;
      // Resolve the focused node from the panel's own root, NOT e.target: this
      // listener is on window (light DOM), outside the bubble's shadow root, so
      // shadow-DOM retargeting makes e.target the shadow HOST (a div) — the field
      // check would never match and Escape-while-typing would collapse the panel.
      // getRootNode() is the shadow root in production (activeElement scoped to the
      // bubble) and the document under jsdom.
      const root = panelRef.current?.getRootNode() as ShadowRoot | Document | null;
      const active = root?.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Abort an in-flight deep scan when the panel closes (or the bubble unmounts).
  // Otherwise startDeepScan keeps auto-scrolling the live page after the user
  // dismissed the UI, with no way to stop it.
  useEffect(() => {
    if (!open) deepScanAbortRef.current?.abort();
  }, [open]);

  // Also abort on full unmount — e.g. the bubble is turned off in Settings while a
  // scan is running. The [open] effect above only covers the panel-close
  // transition; without this, root.unmount() leaves the page auto-scrolling with
  // no UI left to stop it. Empty deps → the cleanup fires only on teardown.
  useEffect(() => () => deepScanAbortRef.current?.abort(), []);

  const persist = useCallback((patch: Partial<SettingsData>) => {
    // Route through the background's single serialized settings writer so a drag
    // here and a Settings save in the popup can't clobber each other. Guard both
    // failure shapes of an invalidated context (the extension reloaded while the
    // bubble is open): sendMessage may reject its promise OR throw synchronously.
    // The local state already updated, so there's nothing to recover — just don't
    // let it escape the pointer handler as an unhandled rejection/error.
    try {
      void Promise.resolve(chrome.runtime.sendMessage({ type: 'SET_SETTINGS', patch })).catch(() => {});
    } catch {
      /* extension context invalidated mid-drag */
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    moved.current = 0;
    origin.current = { x: e.clientX, y: e.clientY };
    setGrabbing(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    // Travel measured from the press origin — robust where movementX is unreliable.
    moved.current = Math.abs(e.clientX - origin.current.x) + Math.abs(e.clientY - origin.current.y);
    // Keep the FAB anchored until travel proves this is a drag, not a click.
    if (moved.current < DRAG_THRESHOLD) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nx = corner.endsWith('left') ? e.clientX - FAB / 2 : vw - e.clientX - FAB / 2;
    const ny = corner.startsWith('top') ? e.clientY - FAB / 2 : vh - e.clientY - FAB / 2;
    setPos({ x: clamp(nx, EDGE, vw - FAB - EDGE), y: clamp(ny, EDGE, vh - FAB - EDGE) });
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setGrabbing(false);
    if (moved.current < DRAG_THRESHOLD) {
      setOpen((o) => !o); // treated as a click
    } else {
      persist({ bubblePosition: { corner, x: pos.x, y: pos.y } });
    }
  };

  // Drag the panel by its header to place it anywhere (a `free` placement).
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    // Let header controls (settings, close, rescan) keep working.
    if ((e.target as Element).closest('button, a, input, select, textarea')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    panelDrag.current = { sx: e.clientX, sy: e.clientY, left: rect.left, top: rect.top, w: rect.width, h: rect.height };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const freePoint = (e: React.PointerEvent, d: NonNullable<typeof panelDrag.current>) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: clamp(d.left + (e.clientX - d.sx), EDGE, Math.max(EDGE, vw - d.w - EDGE)),
      y: clamp(d.top + (e.clientY - d.sy), EDGE, Math.max(EDGE, vh - d.h - EDGE)),
    };
  };

  const onHeaderPointerMove = (e: React.PointerEvent) => {
    const d = panelDrag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < DRAG_THRESHOLD) return;
    setPlacement('free');
    setPanelPoint(freePoint(e, d));
  };

  const onHeaderPointerUp = (e: React.PointerEvent) => {
    const d = panelDrag.current;
    if (!d) return;
    panelDrag.current = null;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < DRAG_THRESHOLD) return;
    persist({ bubblePanelPlacement: 'free', bubblePanelPoint: freePoint(e, d) });
  };

  // Resize the panel by dragging its corner grip; persists bubble width/height.
  const { freeRight, freeBottom } = panelFreeEdges(placement, corner);
  const resizeStart = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);

  const resizeTo = (e: React.PointerEvent, r: NonNullable<typeof resizeStart.current>) => {
    const max = maxPanelSize(placement, pos);
    return {
      w: clamp(r.w + (freeRight ? e.clientX - r.sx : r.sx - e.clientX), MIN_W, max.w),
      h: clamp(r.h + (freeBottom ? e.clientY - r.sy : r.sy - e.clientY), MIN_H, max.h),
    };
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    resizeStart.current = { sx: e.clientX, sy: e.clientY, w: size.w, h: size.h };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeStart.current;
    if (!r) return;
    setSize(resizeTo(e, r));
  };

  const onResizeUp = (e: React.PointerEvent) => {
    const r = resizeStart.current;
    if (!r) return;
    resizeStart.current = null;
    const next = resizeTo(e, r);
    persist({ bubbleWidth: next.w, bubbleHeight: next.h });
  };

  // The button and panel are laid out independently so opening the panel never
  // reflows the launcher — the button stays exactly where it was placed.
  const panelStyle = panelPlacementStyle(placement, corner, pos, size, panelPoint);

  return (
    <>
      {open && (
        // Dim the page behind the panel so it reads on light pages (e.g. X)
        // instead of blending in. Visual only — pointer-events: none keeps the
        // page fully interactive; the panel (higher z-index) sits above the dim.
        <div
          className="mbd-app mbd-bubble-scrim overlay-in"
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 2147483646, background: 'var(--overlay)', pointerEvents: 'none' }}
        />
      )}
      {open && (
        <div
          ref={panelRef}
          className="mbd-app sheet-in mbd:overflow-hidden mbd:rounded-[14px] mbd:border hairline mbd:bg-(--paper) mbd:shadow-2xl"
          style={panelStyle}
        >
          <div className="mbd:h-full">
            <App
              collect={collectLocal}
              deepScan={deepScanLocal}
              abortDeepScan={abortDeepScanLocal}
              surface="bubble"
              onClose={() => setOpen(false)}
              dragHandleProps={{
                onPointerDown: onHeaderPointerDown,
                onPointerMove: onHeaderPointerMove,
                onPointerUp: onHeaderPointerUp,
                onPointerCancel: onHeaderPointerUp,
                style: { cursor: 'grab', touchAction: 'none' },
              }}
            />
          </div>

          {/* Resize grip on the panel's free corner. */}
          <button
            type="button"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            aria-label="Resize panel"
            title="Drag to resize"
            className="mbd:grid mbd:place-items-center mbd:border-0 mbd:bg-transparent mbd:p-0"
            style={{
              position: 'absolute',
              width: 20,
              height: 20,
              zIndex: 3,
              touchAction: 'none',
              [freeRight ? 'right' : 'left']: 1,
              [freeBottom ? 'bottom' : 'top']: 1,
              cursor: freeRight === freeBottom ? 'nwse-resize' : 'nesw-resize',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              style={{ transform: `scale(${freeRight ? 1 : -1}, ${freeBottom ? 1 : -1})`, opacity: 0.6 }}
            >
              <path d="M11 5 L5 11 M11 9 L9 11" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={open ? 'Close Media Bulk Downloads' : 'Open Media Bulk Downloads'}
        aria-label="Media Bulk Downloads"
        className="mbd-app mbd:grid mbd:place-items-center mbd:rounded-full mbd:text-white mbd:shadow-2xl mbd:transition-transform mbd:hover:scale-105 mbd:active:scale-95"
        style={{
          ...anchorStyle(corner, pos.x, pos.y),
          width: FAB,
          height: FAB,
          background: 'var(--brand-ink)',
          color: '#fff', // white icon on the indigo FAB; inline beats .mbd-app's --ink color
          cursor: grabbing ? 'grabbing' : 'pointer',
          touchAction: 'none',
        }}
      >
        <BrandMark size={32} />
      </button>
    </>
  );
};

export default Bubble;
