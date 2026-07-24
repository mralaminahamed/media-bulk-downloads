import { useEffect, useState } from 'react';
import { api } from '../lib/rpc.ts';
import type { FavouriteEntry } from '../lib/rpc.ts';

export function FavouritesPanel() {
  const [items, setItems] = useState<FavouriteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadFavourites() {
    const r = await api.get('/api/favourites');
    setItems((r as { items: FavouriteEntry[] }).items);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadFavourites().finally(() => {
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
      await api.del('/api/favourites/' + encodeURIComponent(src));
    } catch {
      setError('Failed to remove item — reloading favourites');
      await loadFavourites();
    }
  }

  if (loading) return <p style={{ padding: 16, color: 'var(--ink-3)' }}>Loading favourites…</p>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
          <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{items.length}</span>
          {' '}favourite{items.length === 1 ? '' : 's'}
        </span>
        {error && <span style={{ color: 'var(--warn)', fontSize: 12 }}>{error}</span>}
      </div>

      {items.length === 0
        ? <p style={{ color: 'var(--ink-3)' }}>Starred items will show up here.</p>
        : (
          <ul style={{ display: 'flex', flexDirection: 'column', listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it) => (
              <li
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
                    {it.src}
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
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
