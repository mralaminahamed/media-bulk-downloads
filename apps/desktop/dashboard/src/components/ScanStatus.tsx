import { useEffect, useState } from 'react';
import { subscribe } from '../lib/rpc.ts';

interface ScanProgress {
  found: number;
  scrolls: number;
  elapsedMs: number;
  reason?: string;
}

const REASON_LABEL: Record<string, string> = {
  complete: 'Scan complete',
  'max-scrolls': 'Scan stopped (max scrolls)',
  'max-items': 'Scan stopped (max items)',
  'max-time': 'Scan stopped (max time)',
  timeout: 'Scan stopped (timeout)',
  aborted: 'Scan aborted',
  error: 'Scan error',
};

export function ScanStatus() {
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    return subscribe({
      'scan-progress': (data) => setProgress(data as ScanProgress),
    });
  }, []);

  useEffect(() => {
    if (!progress?.reason) return;
    const t = setTimeout(() => setProgress(null), 4000);
    return () => clearTimeout(t);
  }, [progress]);

  if (!progress) return null;

  const done = Boolean(progress.reason);
  const failed = progress.reason === 'error';
  const reasonLabel = REASON_LABEL[progress.reason ?? ''] ?? 'Scan stopped';

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: failed ? 'var(--warn)' : done ? 'var(--brand-ink)' : 'var(--ink-2)',
      }}
    >
      {!done && (
        <div
          aria-hidden
          style={{
            position: 'relative',
            width: 28,
            height: 4,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'var(--panel-2)',
          }}
        >
          <div className="progress-indet" style={{ position: 'absolute', inset: 0 }} />
        </div>
      )}
      <span>
        {done
          ? (
            <>
              {reasonLabel} — <strong className="num">{progress.found}</strong> found
            </>
          )
          : (
            <>
              Scanning… found <strong className="num">{progress.found}</strong> (scroll{' '}
              <strong className="num">{progress.scrolls}</strong>)
            </>
          )}
      </span>
    </div>
  );
}
