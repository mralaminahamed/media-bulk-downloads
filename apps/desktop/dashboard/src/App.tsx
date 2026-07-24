import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImageInfo } from '@mbd/core/types';
import { api, type CollectedItem, subscribe } from './lib/rpc.ts';
import { applyToolbarFilters, DEFAULT_FILTERS, deriveFilterOptions } from './lib/filters.ts';
import type { DesktopSettings } from './lib/settings.ts';
import { BrandMark } from './components/BrandMark.tsx';
import { Grid } from './components/Grid.tsx';
import { Preview } from './components/Preview.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { ScanStatus } from './components/ScanStatus.tsx';
import { CaptureStatus } from './components/CaptureStatus.tsx';
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
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appSettings, setAppSettings] = useState<DesktopSettings | null>(null);
  const [addr, setAddr] = useState('');

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
    api.post('/api/show-browser').catch(() => setNotice({ text: 'Could not show the browser window', error: true }));
  }

  function navigateTo() {
    let u = addr.trim();
    if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
    api.post('/api/navigate', { url: u }).catch(() => setNotice({ text: 'Could not navigate', error: true }));
  }

  function triggerDeepScan() {
    api.post('/api/deep-scan').catch(() => setNotice({ text: 'Could not start deep scan', error: true }));
  }

  // A manifest (HLS .m3u8 or DASH .mpd) isn't a downloadable file, so it stays
  // out of the file-download path regardless of whether it gets a Capture
  // button (see Grid.tsx: Capture is HLS-only, this exclusion is not).
  const manifestSrcs = useMemo(
    () => new Set(items.filter((it) => it.hlsManifest).map((it) => it.src)),
    [items],
  );
  const downloadableVisible = useMemo(() => visible.filter((it) => !it.hlsManifest), [visible]);

  const selectAll = () => setSelected(new Set(downloadableVisible.map((it) => it.src)));
  const selectNone = () => setSelected(new Set());
  const invertSelection = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of downloadableVisible) {
        if (next.has(it.src)) next.delete(it.src);
        else next.add(it.src);
      }
      return next;
    });

  function onCapture(src: string) {
    api.post('/api/capture', { src }).catch(() => setNotice({ text: 'Capture failed to start', error: true }));
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  async function downloadSelected() {
    const srcs = [...selected].filter((src) => !manifestSrcs.has(src));
    setBusy(true);
    try {
      const r = (await api.post('/api/download', { srcs })) as { queued: number; skipped: number };
      setNotice({ text: `queued ${r.queued}, skipped ${r.skipped}` });
      setSelected(new Set());
    } catch {
      setNotice({ text: 'Download failed — try again', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mbd-app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="dotgrid hairline" style={{ flex: 'none', borderBottom: '1px solid var(--line)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            padding: '14px 16px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark size={32} />
            <div style={{ lineHeight: 1.3 }}>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                Media Bulk Downloads
              </h1>
              <p className="eyebrow" style={{ margin: '2px 0 0' }}>Collect · Filter · Save</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <nav role="tablist" className="segwrap">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`seg${tab === t.id ? ' is-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            <button type="button" className="btn btn-sm btn-ghost" onClick={showBrowser}>Show browser</button>
          </div>
        </div>
      </header>

      <div style={{ flex: 'none', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); navigateTo(); }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Enter a URL to browse…"
            aria-label="Browse URL"
            className="field"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={!addr.trim()}>Go</button>
        </form>
      </div>

      <div className="scroll-thin" style={{ flex: 1, overflowY: 'auto' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
                  {visible.length === items.length
                    ? (
                      <>
                        <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{items.length}</span>
                        {' '}item{items.length === 1 ? '' : 's'}
                      </>
                    )
                    : (
                      <>
                        <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{visible.length}</span>
                        {' '}of{' '}
                        <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{items.length}</span>
                        {' '}items
                      </>
                    )}
                </span>
                <span className="countpill">{selected.size} selected</span>
                <QueuePanel />
                <ScanStatus />
                <CaptureStatus />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {notice && (
                  <span style={{ color: notice.error ? 'var(--warn)' : 'var(--brand-ink)', fontSize: 12 }}>
                    {notice.text}
                  </span>
                )}
                <button type="button" className="btn btn-sm" onClick={triggerDeepScan}>Deep scan</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={selectAll} disabled={items.length === 0}>Select all</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={selectNone} disabled={selected.size === 0}>Select none</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={invertSelection} disabled={items.length === 0}>Invert</button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
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
                <p style={{ padding: 16, color: 'var(--ink-3)' }}>
                  Browse a page in the browser window to start collecting media — items will appear here live.
                </p>
              )
              : visible.length === 0
              ? (
                <div style={{ padding: 16, color: 'var(--ink-3)' }}>
                  <p>No items match the current filters.</p>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
                </div>
              )
              : (
                <Grid
                  items={visible}
                  selected={selected}
                  onToggle={toggle}
                  onPreview={setPreviewItem}
                  onCapture={onCapture}
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
    </div>
  );
}
