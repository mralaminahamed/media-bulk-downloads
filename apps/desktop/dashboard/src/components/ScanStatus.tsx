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
  const label = done
    ? `${REASON_LABEL[progress.reason ?? ''] ?? 'Scan stopped'} — ${progress.found} found`
    : `Scanning… found ${progress.found} (scroll ${progress.scrolls})`;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: done ? 'var(--ok)' : 'var(--brand)',
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
}
