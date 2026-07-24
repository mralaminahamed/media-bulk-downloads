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
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      {items.map(([src, entry]) => {
        const failed = entry.reason === 'error';
        const complete = entry.reason === 'complete';
        const done = Boolean(entry.reason);
        const determinate = entry.total > 0;
        const pct = determinate ? Math.min(100, Math.round((entry.done / entry.total) * 100)) : 0;
        const label = failed ? 'Capture failed' : complete ? 'Captured' : 'Capturing…';

        return (
          <div
            key={src}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: failed ? 'var(--warn)' : done ? 'var(--brand-ink)' : 'var(--ink-2)',
            }}
          >
            <span>{label}</span>
            {!done && (
              <>
                <span className="num">{entry.done}/{entry.total}</span>
                <div
                  style={{
                    position: 'relative',
                    width: 40,
                    height: 4,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: 'var(--panel-2)',
                  }}
                >
                  {determinate
                    ? (
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: 'var(--brand)',
                          transition: 'width 200ms ease',
                        }}
                      />
                    )
                    : <div className="progress-indet" style={{ position: 'absolute', inset: 0 }} />}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
