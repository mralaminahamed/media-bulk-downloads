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
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: maxDim,
          maxHeight: maxDimH,
          background: 'var(--panel)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--line)',
          boxShadow: '0 24px 48px -16px rgba(0, 0, 0, 0.45)',
          padding: 12,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          title="Close"
          className="iconbtn"
          style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}
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
              style={{ maxWidth: maxDim, maxHeight: maxDimH, display: 'block', borderRadius: 'var(--radius-sm)' }}
            />
          )
          : item.kind === 'audio'
          ? (
            <div style={{ minWidth: 320 }}>
              <p
                style={{
                  marginTop: 0,
                  paddingRight: 32,
                  wordBreak: 'break-all',
                  color: 'var(--ink-3)',
                  fontSize: 12,
                }}
              >
                {item.src}
              </p>
              <audio src={item.src} controls autoPlay style={{ width: '100%' }} />
            </div>
          )
          : (
            <img
              src={item.src}
              alt=""
              style={{ maxWidth: maxDim, maxHeight: maxDimH, display: 'block', borderRadius: 'var(--radius-sm)' }}
            />
          )}
      </div>
    </div>
  );
}
