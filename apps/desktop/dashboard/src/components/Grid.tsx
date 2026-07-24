import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { CollectedItem } from '../lib/rpc.ts';

const DEFAULT_TILE_SIZE = 150;

export interface GridProps {
  items: CollectedItem[];
  selected: Set<string>;
  onToggle: (src: string) => void;
  onPreview?: (item: CollectedItem) => void;
  onCapture?: (src: string) => void;
  tileSize?: number;
}

export function Grid({ items, selected, onToggle, onPreview, onCapture, tileSize }: GridProps) {
  const size = tileSize ?? DEFAULT_TILE_SIZE;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`,
        gap: 10,
        padding: 16,
      }}
    >
      {items.map((item) => (
        <Tile
          key={item.src}
          item={item}
          isSelected={selected.has(item.src)}
          onToggle={onToggle}
          onPreview={onPreview}
          onCapture={onCapture}
        />
      ))}
    </div>
  );
}

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'var(--brand-soft)',
  color: 'var(--ink-2)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: '2px 6px',
  borderRadius: 'var(--radius-xs)',
  lineHeight: 1,
  pointerEvents: 'none',
};

function Tile(
  { item, isSelected, onToggle, onPreview, onCapture }: {
    item: CollectedItem;
    isSelected: boolean;
    onToggle: (src: string) => void;
    onPreview?: (item: CollectedItem) => void;
    onCapture?: (src: string) => void;
  },
) {
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const thumb = item.thumbnailSrc ?? item.poster ?? item.src;
  // Any manifest item (HLS .m3u8 or DASH .mpd) is not a downloadable file, so
  // it's never selectable/toggleable. Only true HLS gets the Capture
  // affordance — DASH capture isn't implemented yet, so it stays inert.
  const isManifest = Boolean(item.hlsManifest);
  const isHls = item.type === 'm3u8';
  const showActions = hovered;

  return (
    <div
      role={isManifest ? undefined : 'button'}
      aria-pressed={isManifest ? undefined : isSelected}
      tabIndex={isManifest ? undefined : 0}
      onClick={isManifest ? undefined : () => onToggle(item.src)}
      onDoubleClick={() => onPreview?.(item)}
      onKeyDown={isManifest ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(item.src);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid var(--line)',
        boxShadow: isSelected ? '0 0 0 2px var(--brand)' : undefined,
        background: 'var(--panel)',
        cursor: isManifest ? 'default' : 'pointer',
      }}
    >
      {failed || !thumb
        ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              background: 'var(--panel-2)',
              color: 'var(--ink-3)',
              fontSize: 12,
              textAlign: 'center',
              padding: 8,
            }}
          >
            No preview
          </div>
        )
        : (
          <img
            src={thumb}
            loading="lazy"
            onError={() => setFailed(true)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}

      {/* Hover/focus veil surfacing the action buttons below. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--scrim)',
          opacity: showActions ? 1 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
      />

      {item.kind !== 'image' && (
        <span style={{ ...badgeStyle, position: 'absolute', left: 6, bottom: 6 }}>
          {item.kind}
        </span>
      )}

      {onPreview && (
        <button
          type="button"
          className="iconbtn iconbtn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(item);
          }}
          title="Preview"
          aria-label="Preview"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: 'var(--panel)',
            opacity: showActions ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          ⤢
        </button>
      )}

      {isHls && (
        <span aria-hidden style={{ ...badgeStyle, position: 'absolute', top: 6, left: 6 }}>
          HLS
        </span>
      )}

      {isHls && onCapture && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onCapture(item.src);
          }}
          title="Capture stream"
          aria-label="Capture stream"
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            opacity: showActions ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          Capture
        </button>
      )}

      {!isManifest && isSelected && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--brand)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
          }}
        >
          ✓
        </span>
      )}
    </div>
  );
}
