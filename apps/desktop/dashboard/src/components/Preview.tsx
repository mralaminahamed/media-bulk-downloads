import { useEffect } from 'react';
import type { CollectedItem } from '../lib/rpc.ts';

export interface PreviewProps {
  item: CollectedItem | null;
  onClose: () => void;
  maxSize?: number;
}

export function Preview({ item, onClose, maxSize }: PreviewProps) {
  const maxDim = maxSize != null ? `min(90vw, ${maxSize}px)` : '90vw';
  const maxDimH = maxSize != null ? `min(90vh, ${maxSize}px)` : '90vh';
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', maxWidth: maxDim, maxHeight: maxDimH }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          style={{
            position: 'absolute',
            top: -40,
            right: 0,
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 22,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>

        {item.kind === 'video'
          ? (
            <video
              src={item.src}
              poster={item.poster}
              controls
              autoPlay
              style={{ maxWidth: maxDim, maxHeight: maxDimH, display: 'block', borderRadius: 8 }}
            />
          )
          : item.kind === 'audio'
          ? (
            <div
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                padding: 24,
                borderRadius: 8,
                minWidth: 320,
              }}
            >
              <p style={{ marginTop: 0, wordBreak: 'break-all', color: 'var(--muted)', fontSize: 12 }}>
                {item.src}
              </p>
              <audio src={item.src} controls autoPlay style={{ width: '100%' }} />
            </div>
          )
          : (
            <img
              src={item.src}
              alt=""
              style={{ maxWidth: maxDim, maxHeight: maxDimH, display: 'block', borderRadius: 8 }}
            />
          )}
      </div>
    </div>
  );
}
