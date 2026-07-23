import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/rpc.ts';
import type { DesktopSettings } from '../lib/settings.ts';
import { DownloadsPane } from './settings/DownloadsPane.tsx';
import { MediaPane } from './settings/MediaPane.tsx';

type Pane = 'downloads' | 'media' | 'display' | 'data' | 'advanced';

const PANES: { id: Pane; label: string }[] = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'media', label: 'Media' },
  { id: 'display', label: 'Display' },
  { id: 'data', label: 'Data' },
  { id: 'advanced', label: 'Advanced' },
];

const DEBOUNCE_MS = 400;

export function Settings() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [pane, setPane] = useState<Pane>('downloads');
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<DesktopSettings | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSettings = useCallback(() => {
    setError(null);
    api.get('/api/settings').then((r) => setSettings(r as DesktopSettings)).catch(() =>
      setError('Failed to load settings')
    );
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!error || !settings) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error, settings]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, []);

  function putNow(next: DesktopSettings) {
    api.put('/api/settings', next)
      .then((r) => setSettings(r as DesktopSettings))
      .catch(() => setError('Failed to save settings — try again'));
  }

  const patch = useCallback((partial: Partial<DesktopSettings>, debounce = false) => {
    const current = settingsRef.current;
    if (!current) return;
    const next = { ...current, ...partial };
    settingsRef.current = next;
    setSettings(next);

    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (debounce) {
      debounceRef.current = setTimeout(() => putNow(next), DEBOUNCE_MS);
    } else {
      putNow(next);
    }
  }, []);

  if (!settings) {
    if (error) {
      return (
        <div style={{ padding: 16 }}>
          <p style={{ color: '#dc2626', fontSize: 12, marginTop: 0 }}>{error}</p>
          <button type="button" className="primary" onClick={loadSettings}>Retry</button>
        </div>
      );
    }
    return <p style={{ padding: 16, color: 'var(--muted)' }}>Loading settings…</p>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <nav style={{ width: 150, flexShrink: 0, padding: '16px 8px', borderRight: '1px solid var(--line)' }}>
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPane(p.id)}
            className={pane === p.id ? 'primary' : undefined}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 0, maxWidth: 560, padding: '16px 24px' }}>
        {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 0 }}>{error}</p>}

        {pane === 'downloads' && <DownloadsPane settings={settings} patch={patch} />}
        {pane === 'media' && <MediaPane settings={settings} patch={patch} />}
        {pane === 'display' && <ComingSoonPane name="Display" />}
        {pane === 'data' && <ComingSoonPane name="Data" />}
        {pane === 'advanced' && <ComingSoonPane name="Advanced" />}
      </div>
    </div>
  );
}

function ComingSoonPane({ name }: { name: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>{name}</h2>
      <p style={{ color: 'var(--muted)' }}>{name} settings are coming soon.</p>
    </div>
  );
}
