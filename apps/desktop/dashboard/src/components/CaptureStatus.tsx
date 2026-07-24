import { useEffect, useRef, useState } from 'react';
import { subscribe } from '../lib/rpc.ts';

interface CaptureProgress {
  src: string;
  done?: number;
  total?: number;
  reason?: string;
}

interface CaptureEntry {
  done: number;
  total: number;
  reason?: string;
}

export function CaptureStatus() {
  const [entries, setEntries] = useState<Record<string, CaptureEntry>>({});
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const activeTimers = timers.current;
    const unsub = subscribe({
      'capture-progress': (data) => {
        const p = data as CaptureProgress;
        const done = p.done ?? 0;
        const total = p.total ?? 0;

        setEntries((prev) => ({ ...prev, [p.src]: { done, total, reason: p.reason } }));

        const existing = activeTimers.get(p.src);
        if (existing != null) {
          clearTimeout(existing);
          activeTimers.delete(p.src);
        }

        if (p.reason) {
          const t = setTimeout(() => {
            setEntries((prev) => {
              const next = { ...prev };
              delete next[p.src];
              return next;
            });
            activeTimers.delete(p.src);
          }, 4000);
          activeTimers.set(p.src, t);
        }
      },
    });

    return () => {
      unsub();
      for (const t of activeTimers.values()) clearTimeout(t);
      activeTimers.clear();
    };
  }, []);

  const items = Object.entries(entries);
  if (items.length === 0) return null;

  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      {items.map(([src, entry]) => {
        const failed = entry.reason === 'error';
        const complete = entry.reason === 'complete';
        const done = Boolean(entry.reason);
        const label = failed
          ? 'Capture failed'
          : complete
          ? 'Captured'
          : `Capturing… ${entry.done}/${entry.total}`;

        return (
          <div
            key={src}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: failed ? '#dc2626' : done ? 'var(--ok)' : 'var(--brand)',
            }}
          >
            {!done && (
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  border: '2px solid var(--brand)',
                  borderTopColor: 'transparent',
                  animation: 'mbd-spin 0.8s linear infinite',
                }}
              />
            )}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
