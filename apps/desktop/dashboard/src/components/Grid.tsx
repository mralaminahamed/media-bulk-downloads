import { useState } from 'react';
import type { CollectedItem } from '../lib/rpc.ts';

const DEFAULT_TILE_SIZE = 150;

export interface GridProps {
  items: CollectedItem[];
  selected: Set<string>;
  onToggle: (src: string) => void;
  onPreview?: (item: CollectedItem) => void;
  tileSize?: number;
}

export function Grid({ items, selected, onToggle, onPreview, tileSize }: GridProps) {
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
        />
      ))}
    </div>
  );
}

function Tile(
  { item, isSelected, onToggle, onPreview }: {
    item: CollectedItem;
    isSelected: boolean;
    onToggle: (src: string) => void;
    onPreview?: (item: CollectedItem) => void;
  },
) {
  const [failed, setFailed] = useState(false);
  const thumb = item.thumbnailSrc ?? item.poster ?? item.src;

  return (
    <div
      role="button"
      aria-pressed={isSelected}
      tabIndex={0}
      onClick={() => onToggle(item.src)}
      onDoubleClick={() => onPreview?.(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(item.src);
        }
      }}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 8,
        overflow: 'hidden',
        border: isSelected ? '2px solid var(--brand)' : '1px solid var(--line)',
        background: 'var(--bg)',
        cursor: 'pointer',
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
              color: 'var(--muted)',
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

      {item.kind !== 'image' && (
        <span
          style={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            background: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            padding: '2px 6px',
            borderRadius: 4,
            textTransform: 'uppercase',
          }}
        >
          {item.kind}
        </span>
      )}

      {onPreview && (
        <button
          type="button"
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
            lineHeight: 1,
            padding: '3px 6px',
            fontSize: 12,
            opacity: 0.85,
          }}
        >
          ⤢
        </button>
      )}

      {isSelected && (
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
