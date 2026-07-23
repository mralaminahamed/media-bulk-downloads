import { useEffect, useState } from 'react';
import { api } from '../lib/rpc.ts';
import type { StoredHistoryEntry } from '../lib/rpc.ts';

export function HistoryPanel() {
  const [items, setItems] = useState<StoredHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    const r = await api.get('/api/history');
    setItems((r as { items: StoredHistoryEntry[] }).items);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadHistory().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  async function remove(src: string) {
    setItems((prev) => prev.filter((it) => it.src !== src));
    try {
      await api.del('/api/history/' + encodeURIComponent(src));
    } catch {
      setError('Failed to remove item — reloading history');
      await loadHistory();
    }
  }

  async function clearAll() {
    setItems([]);
    try {
      await api.del('/api/history');
    } catch {
      setError('Failed to clear history — reloading history');
      await loadHistory();
    }
  }

  if (loading) return <p style={{ padding: 16, color: 'var(--muted)' }}>Loading history…</p>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {items.length} download{items.length === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {error && <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span>}
          <button type="button" onClick={clearAll} disabled={items.length === 0}>Clear all</button>
        </div>
      </div>

      {items.length === 0
        ? <p style={{ color: 'var(--muted)' }}>Downloads you make will show up here.</p>
        : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it) => (
              <li
                key={it.src}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                }}
              >
                <img
                  src={it.thumbnailSrc ?? it.src}
                  alt=""
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--line)' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.filename ?? it.src}
                  </div>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--muted)',
                      fontSize: 12,
                    }}
                  >
                    {it.sourcePageUrl}
                  </div>
                </div>
                <button type="button" onClick={() => remove(it.src)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
