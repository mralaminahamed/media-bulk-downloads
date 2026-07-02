import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BubbleCorner, BubblePanelPlacement, ImageInfo, SettingsData } from '@/types';
import { withDefaults } from '../shared/settings';
import { collectImages } from '../collect';
import App from '../popup/App';

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

const collectLocal = (): Promise<ImageInfo[]> => Promise.resolve(collectImages());

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

  // Free-drag of the panel via its header.
  const panelRef = useRef<HTMLDivElement>(null);
  const panelDrag = useRef<{ sx: number; sy: number; left: number; top: number; w: number; h: number } | null>(null);

  // Keep corner/position in sync when changed from the popup settings.
  useEffect(() => {
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'sync' || !changes.settings) return;
      const next = withDefaults(changes.settings.newValue as Partial<SettingsData>);
      setCorner(next.bubblePosition.corner);
      setPos({ x: next.bubblePosition.x, y: next.bubblePosition.y });
      setSize({ w: next.bubbleWidth, h: next.bubbleHeight });
      setPlacement(next.bubblePanelPlacement);
      setPanelPoint({ x: next.bubblePanelPoint.x, y: next.bubblePanelPoint.y });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Toolbar-icon clicks (when the popup is disabled) toggle the panel.
  useEffect(() => {
    const listener = (message: unknown) => {
      if (message === 'TOGGLE_BUBBLE') setOpen((o) => !o);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const persist = useCallback((patch: Partial<SettingsData>) => {
    chrome.storage.sync.get(['settings'], (result) => {
      const merged = withDefaults(result.settings as Partial<SettingsData>);
      chrome.storage.sync.set({ settings: { ...merged, ...patch } });
    });
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
        <div
          ref={panelRef}
          className="ibd-app sheet-in overflow-hidden rounded-[14px] border hairline bg-[var(--paper)] shadow-2xl"
          style={panelStyle}
        >
          <div className="h-full">
            <App
              collect={collectLocal}
              surface="bubble"
              onClose={() => setOpen(false)}
              dragHandleProps={{
                onPointerDown: onHeaderPointerDown,
                onPointerMove: onHeaderPointerMove,
                onPointerUp: onHeaderPointerUp,
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
            className="grid place-items-center border-0 bg-transparent p-0"
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
        title={open ? 'Close Image Bulk Downloads' : 'Open Image Bulk Downloads'}
        aria-label="Image Bulk Downloads"
        className="ibd-app grid place-items-center rounded-full text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
        style={{
          ...anchorStyle(corner, pos.x, pos.y),
          width: FAB,
          height: FAB,
          background: 'var(--brand-ink)',
          cursor: grabbing ? 'grabbing' : 'pointer',
          touchAction: 'none',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10.3" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          <circle cx="9" cy="9" r="2" />
          <path d="M19 16v6" />
          <path d="m22 19-3 3-3-3" />
        </svg>
      </button>
    </>
  );
};

export default Bubble;
