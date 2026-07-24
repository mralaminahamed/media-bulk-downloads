import { useEffect, useState } from 'react';
import { api, subscribe } from '../lib/rpc.ts';

export interface QueueStatus {
  pending: number;
  active: number;
  done: number;
  failed: number;
}

const EMPTY: QueueStatus = { pending: 0, active: 0, done: 0, failed: 0 };

export function QueuePanel() {
  const [status, setStatus] = useState<QueueStatus>(EMPTY);

  useEffect(() => {
    api.get('/api/queue').then((r) => setStatus(r as QueueStatus));
    return subscribe({ queue: (data) => setStatus(data as QueueStatus) });
  }, []);

  const { pending, active, done, failed } = status;
  const total = pending + active + done + failed;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  if (total === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 24,
        padding: '0 10px',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--panel)',
        fontSize: 11,
      }}
    >
      <div
        style={{
          width: 48,
          height: 4,
          borderRadius: 999,
          background: 'var(--panel-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--brand)',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <span style={{ color: 'var(--ink-2)' }}>
        <strong className="num" style={{ color: 'var(--ink-2)' }}>{active}</strong> active ·{' '}
        <strong className="num" style={{ color: 'var(--ink)' }}>{pending}</strong> pending ·{' '}
        <strong className="num" style={{ color: 'var(--brand-ink)' }}>{done}</strong> done
        {failed > 0 && (
          <>
            {' '}· <strong className="num" style={{ color: 'var(--warn)' }}>{failed}</strong> failed
          </>
        )}
      </span>
    </div>
  );
}
