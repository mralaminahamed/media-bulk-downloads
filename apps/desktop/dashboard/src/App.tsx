import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImageInfo } from '@mbd/core/types';
import { api, type CollectedItem, subscribe } from './lib/rpc.ts';
import { applyToolbarFilters, DEFAULT_FILTERS, deriveFilterOptions } from './lib/filters.ts';
import type { DesktopSettings } from './lib/settings.ts';
import { Grid } from './components/Grid.tsx';
import { Preview } from './components/Preview.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { ScanStatus } from './components/ScanStatus.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { FavouritesPanel } from './components/FavouritesPanel.tsx';
import { FilterToolbar } from './components/FilterToolbar.tsx';
import { Settings } from './components/Settings.tsx';

type Tab = 'library' | 'history' | 'favourites' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'history', label: 'History' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'settings', label: 'Settings' },
];

function dedupeBySrc(items: CollectedItem[]): CollectedItem[] {
  const byKey = new Map<string, CollectedItem>();
  for (const it of items) byKey.set(it.src, it);
  return [...byKey.values()];
}

export function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [items, setItems] = useState<CollectedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<CollectedItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appSettings, setAppSettings] = useState<DesktopSettings | null>(null);

  const available = useMemo(() => deriveFilterOptions(items as unknown as ImageInfo[]), [items]);
  const visible = useMemo(
    () => applyToolbarFilters(items as unknown as ImageInfo[], filters) as unknown as CollectedItem[],
    [items, filters],
  );

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

  useEffect(() => {
    api.get('/api/settings').then((r) => setAppSettings(r as DesktopSettings)).catch(() => {});
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

  function showBrowser() {
    api.post('/api/show-browser').catch(() => setNotice('Could not show the browser window'));
  }

  function triggerDeepScan() {
    api.post('/api/deep-scan').catch(() => setNotice('Could not start deep scan'));
  }

  const selectAll = () => setSelected(new Set(visible.map((it) => it.src)));
  const selectNone = () => setSelected(new Set());
  const invertSelection = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of visible) {
        if (next.has(it.src)) next.delete(it.src);
        else next.add(it.src);
      }
      return next;
    });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  async function downloadSelected() {
    const srcs = [...selected];
    setBusy(true);
    try {
      const r = (await api.post('/api/download', { srcs })) as { queued: number; skipped: number };
      setNotice(`queued ${r.queued}, skipped ${r.skipped}`);
      setSelected(new Set());
    } catch {
      setNotice('Download failed — try again');
    } finally {
      setBusy(false);
    }
  }

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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <nav role="tablist" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'primary' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button type="button" onClick={showBrowser}>Show browser</button>
        </div>
      </header>

      {tab === 'library' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '12px 16px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {visible.length === items.length
                  ? `${items.length} item${items.length === 1 ? '' : 's'}`
                  : `${visible.length} of ${items.length} items`} · {selected.size} selected
              </span>
              <QueuePanel />
              <ScanStatus />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {notice && <span style={{ color: 'var(--ok)', fontSize: 12 }}>{notice}</span>}
              <button type="button" onClick={triggerDeepScan}>Deep scan</button>
              <button type="button" onClick={selectAll} disabled={items.length === 0}>Select all</button>
              <button type="button" onClick={selectNone} disabled={selected.size === 0}>Select none</button>
              <button type="button" onClick={invertSelection} disabled={items.length === 0}>Invert</button>
              <button
                type="button"
                className="primary"
                onClick={downloadSelected}
                disabled={busy || selected.size === 0}
              >
                Download selected ({selected.size})
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <FilterToolbar
              filters={filters}
              available={available}
              onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            />
          )}

          {items.length === 0
            ? (
              <p style={{ padding: 16, color: 'var(--muted)' }}>
                Browse a page in the browser window to start collecting media — items will appear here live.
              </p>
            )
            : visible.length === 0
            ? (
              <div style={{ padding: 16, color: 'var(--muted)' }}>
                <p>No items match the current filters.</p>
                <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
              </div>
            )
            : (
              <Grid
                items={visible}
                selected={selected}
                onToggle={toggle}
                onPreview={setPreviewItem}
                tileSize={appSettings?.thumbnailSize}
              />
            )}

          <Preview item={previewItem} onClose={closePreview} maxSize={appSettings?.previewSize} />
        </>
      )}

      {tab === 'history' && <HistoryPanel />}
      {tab === 'favourites' && <FavouritesPanel />}
      {tab === 'settings' && <Settings onSettingsChange={setAppSettings} />}
    </div>
  );
}
