import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/rpc.ts';

const NOTICE_MS = 4000;
const CONFIRM_MS = 5000;

const rowStyle: CSSProperties = {
  display: 'block',
  padding: '10px 0',
  borderBottom: '1px solid var(--line)',
};

const labelRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--ink)' };
const hintStyle: CSSProperties = { display: 'block', marginTop: 4, fontSize: 11, color: 'var(--ink-3)' };

interface ImportResult {
  ok: boolean;
  history: number;
  favourites: number;
}

export function DataPane() {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current != null) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  async function exportBackup() {
    setError(null);
    try {
      const data = await api.get('/api/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mbd-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice('Exported backup');
    } catch {
      setError('Failed to export backup — try again');
    }
  }

  async function importBackup(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const r = (await api.post('/api/import', parsed)) as ImportResult;
      setNotice(`Imported: ${r.history} history, ${r.favourites} favourites, settings restored`);
    } catch {
      setError('Failed to import backup — check the file and try again');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function clearHistoryClick() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmingClear(false), CONFIRM_MS);
      return;
    }
    if (confirmTimerRef.current != null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmingClear(false);
    setError(null);
    api.del('/api/history')
      .then(() => setNotice('History cleared'))
      .catch(() => setError('Failed to clear history — try again'));
  }

  return (
    <div>
      <p className="eyebrow" style={{ margin: '0 0 12px' }}>Data</p>

      {(error ?? notice) && (
        <p style={{ fontSize: 12, marginTop: 0, color: error ? 'var(--warn)' : 'var(--brand-ink)' }}>
          {error ?? notice}
        </p>
      )}

      <div style={rowStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Export backup</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={exportBackup}>Export</button>
        </div>
        <span style={hintStyle}>Download settings, history, and favourites as a JSON file</span>
      </div>

      <div style={rowStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Import backup</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => importBackup(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>
        <span style={hintStyle}>Merges history & favourites and restores settings from the backup file</span>
      </div>

      <div style={rowStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Clear history</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={clearHistoryClick}
            style={confirmingClear ? { color: 'var(--warn)', borderColor: 'var(--warn)' } : undefined}
          >
            {confirmingClear ? 'Confirm clear?' : 'Clear history'}
          </button>
        </div>
        <span style={hintStyle}>Removes all download history. Favourites and settings are not affected.</span>
      </div>
    </div>
  );
}
