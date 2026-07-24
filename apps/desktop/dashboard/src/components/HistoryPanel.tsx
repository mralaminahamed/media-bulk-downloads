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

  if (loading) return <p style={{ padding: 16, color: 'var(--ink-3)' }}>Loading history…</p>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
          <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{items.length}</span>
          {' '}download{items.length === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {error && <span style={{ color: 'var(--warn)', fontSize: 12 }}>{error}</span>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll} disabled={items.length === 0}>
            Clear all
          </button>
        </div>
      </div>

      {items.length === 0
        ? <p style={{ color: 'var(--ink-3)' }}>Downloads you make will show up here.</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((it) => (
              <div
                key={it.src}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 4px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div
                  className="checker"
                  style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', flexShrink: 0, overflow: 'hidden' }}
                >
                  <img
                    src={it.thumbnailSrc ?? it.src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)', fontSize: 13 }}>
                    {it.filename ?? it.src}
                  </div>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--ink-3)',
                      fontSize: 12,
                    }}
                  >
                    {it.sourcePageUrl}
                  </div>
                </div>
                <button
                  type="button"
                  className="iconbtn iconbtn-sm"
                  onClick={() => remove(it.src)}
                  title="Remove"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
