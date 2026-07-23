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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <div
        style={{
          width: 90,
          height: 6,
          borderRadius: 3,
          background: 'var(--line)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--ok)',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <span style={{ color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--brand)' }}>{active}</strong> active ·{' '}
        <strong style={{ color: 'var(--fg)' }}>{pending}</strong> pending ·{' '}
        <strong style={{ color: 'var(--ok)' }}>{done}</strong> done
        {failed > 0 && (
          <>
            {' '}· <strong style={{ color: '#dc2626' }}>{failed}</strong> failed
          </>
        )}
      </span>
    </div>
  );
}
