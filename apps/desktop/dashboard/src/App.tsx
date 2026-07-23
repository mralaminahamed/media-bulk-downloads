import { useCallback, useEffect, useState } from 'react';
import { api, type CollectedItem, subscribe } from './lib/rpc.ts';
import { Grid } from './components/Grid.tsx';
import { Preview } from './components/Preview.tsx';

function dedupeBySrc(items: CollectedItem[]): CollectedItem[] {
  const byKey = new Map<string, CollectedItem>();
  for (const it of items) byKey.set(it.src, it);
  return [...byKey.values()];
}

export function App() {
  const [items, setItems] = useState<CollectedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<CollectedItem | null>(null);

  useEffect(() => {
    api.get('/api/media').then((r) => {
      setItems((prev) => dedupeBySrc([...prev, ...(r as { items: CollectedItem[] }).items]));
    });
    return subscribe({
      'media-added': (data) => {
        const { added } = data as { added: CollectedItem[] };
        setItems((prev) => dedupeBySrc([...prev, ...added]));
      },
    });
  }, []);

  function toggle(src: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  const closePreview = useCallback(() => setPreviewItem(null), []);

  const selectAll = () => setSelected(new Set(items.map((it) => it.src)));
  const selectNone = () => setSelected(new Set());
  const invertSelection = () =>
    setSelected((prev) => {
      const next = new Set<string>();
      for (const it of items) if (!prev.has(it.src)) next.add(it.src);
      return next;
    });

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand), var(--brand-2))',
              flexShrink: 0,
            }}
          />
          <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>Media Bulk Downloads</h1>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {items.length} item{items.length === 1 ? '' : 's'} · {selected.size} selected
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={selectAll} disabled={items.length === 0}>Select all</button>
          <button type="button" onClick={selectNone} disabled={selected.size === 0}>Select none</button>
          <button type="button" onClick={invertSelection} disabled={items.length === 0}>Invert</button>
        </div>
      </header>

      {items.length === 0
        ? (
          <p style={{ padding: 16, color: 'var(--muted)' }}>
            Browse a page in the browser window to start collecting media — items will appear here live.
          </p>
        )
        : <Grid items={items} selected={selected} onToggle={toggle} onPreview={setPreviewItem} />}

      <Preview item={previewItem} onClose={closePreview} />
    </div>
  );
}
