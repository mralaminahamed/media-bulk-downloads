import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/rpc.ts';
import type { DesktopSettings } from '../lib/settings.ts';
import { DownloadsPane } from './settings/DownloadsPane.tsx';
import { MediaPane } from './settings/MediaPane.tsx';
import { DisplayPane } from './settings/DisplayPane.tsx';
import { DataPane } from './settings/DataPane.tsx';
import { AdvancedPane } from './settings/AdvancedPane.tsx';

export interface SettingsProps {
  onSettingsChange?: (settings: DesktopSettings) => void;
}

type Pane = 'downloads' | 'media' | 'display' | 'data' | 'advanced';

const PANES: { id: Pane; label: string }[] = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'media', label: 'Media' },
  { id: 'display', label: 'Display' },
  { id: 'data', label: 'Data' },
  { id: 'advanced', label: 'Advanced' },
];

const DEBOUNCE_MS = 400;

export function Settings({ onSettingsChange }: SettingsProps = {}) {
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
      .then((r) => {
        const saved = r as DesktopSettings;
        setSettings(saved);
        onSettingsChange?.(saved);
      })
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
          <p style={{ color: 'var(--warn)', fontSize: 12, marginTop: 0 }}>{error}</p>
          <button type="button" className="btn btn-sm" onClick={loadSettings}>Retry</button>
        </div>
      );
    }
    return <p style={{ padding: 16, color: 'var(--ink-3)' }}>Loading settings…</p>;
  }

  return (
    <div style={{ padding: 16 }}>
      <nav role="tablist" aria-label="Settings sections" className="segwrap" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pane === p.id}
            onClick={() => setPane(p.id)}
            className={`seg${pane === p.id ? ' is-active' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {error && <p style={{ color: 'var(--warn)', fontSize: 12, marginTop: 0 }}>{error}</p>}

      <div className="card" style={{ maxWidth: 560, padding: '16px 20px' }}>
        {pane === 'downloads' && <DownloadsPane settings={settings} patch={patch} />}
        {pane === 'media' && <MediaPane settings={settings} patch={patch} />}
        {pane === 'display' && <DisplayPane settings={settings} patch={patch} />}
        {pane === 'data' && <DataPane />}
        {pane === 'advanced' && <AdvancedPane settings={settings} patch={patch} />}
      </div>
    </div>
  );
}
