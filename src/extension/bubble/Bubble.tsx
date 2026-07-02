import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BubbleCorner, BubblePosition, ImageInfo, SettingsData } from '@/types';
import { withDefaults } from '../shared/settings';
import { collectImages } from '../collect';
import App from '../popup/App';

interface BubbleProps {
  initialSettings: SettingsData;
}

const FAB = 48;
const EDGE = 8;
const PANEL_W = 440;

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

const collectLocal = (): Promise<ImageInfo[]> => Promise.resolve(collectImages());

const Bubble: React.FC<BubbleProps> = ({ initialSettings }) => {
  const [open, setOpen] = useState(false);
  const [corner, setCorner] = useState<BubbleCorner>(initialSettings.bubblePosition.corner);
  const [pos, setPos] = useState({ x: initialSettings.bubblePosition.x, y: initialSettings.bubblePosition.y });
  const [grabbing, setGrabbing] = useState(false);

  const dragging = useRef(false);
  const moved = useRef(0);

  // Keep corner/position in sync when changed from the popup settings.
  useEffect(() => {
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'sync' || !changes.settings) return;
      const next = withDefaults(changes.settings.newValue as Partial<SettingsData>).bubblePosition;
      setCorner(next.corner);
      setPos({ x: next.x, y: next.y });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
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

  const persist = useCallback((next: BubblePosition) => {
    chrome.storage.sync.get(['settings'], (result) => {
      const merged = withDefaults(result.settings as Partial<SettingsData>);
      chrome.storage.sync.set({ settings: { ...merged, bubblePosition: next } });
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    moved.current = 0;
    setGrabbing(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    moved.current += Math.abs(e.movementX) + Math.abs(e.movementY);
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
    if (moved.current < 5) {
      setOpen((o) => !o); // treated as a click
    } else {
      persist({ corner, x: pos.x, y: pos.y });
    }
  };

  // Panel height fits the viewport with margin for the FAB + gaps.
  const panelHeight = `min(560px, calc(100vh - ${pos.y + FAB + 24}px))`;
  const flexDir = corner.startsWith('top') ? 'flex-col' : 'flex-col-reverse';
  const alignSide = corner.endsWith('left') ? 'items-start' : 'items-end';

  return (
    <div className={`ibd-app flex gap-2.5 ${flexDir} ${alignSide}`} style={anchorStyle(corner, pos.x, pos.y)}>
      {open && (
        <div
          className="sheet-in overflow-hidden rounded-[14px] border hairline bg-[var(--paper)] shadow-2xl"
          style={{ width: PANEL_W, height: panelHeight }}
        >
          <div className="h-full">
            <App collect={collectLocal} surface="bubble" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={open ? 'Close Image Bulk Downloads' : 'Open Image Bulk Downloads'}
        aria-label="Image Bulk Downloads"
        className="grid place-items-center rounded-full text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
        style={{
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
    </div>
  );
};

export default Bubble;
