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

  if (loading) return <p style={{ padding: 16, color: 'var(--muted)' }}>Loading favourites…</p>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {items.length} favourite{items.length === 1 ? '' : 's'}
        </span>
        {error && <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span>}
      </div>

      {items.length === 0
        ? <p style={{ color: 'var(--muted)' }}>Starred items will show up here.</p>
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
                    {it.src}
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
