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

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 500 };
const hintStyle: CSSProperties = { display: 'block', marginTop: 4, fontSize: 11, color: 'var(--muted)' };

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
      a.click();
      URL.revokeObjectURL(url);
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
      setNotice(`Imported: ${r.history} history, ${r.favourites} favourites`);
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
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Data</h2>

      {(error ?? notice) && (
        <p style={{ fontSize: 12, marginTop: 0, color: error ? '#dc2626' : 'var(--ok)' }}>
          {error ?? notice}
        </p>
      )}

      <div style={rowStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Export backup</span>
          <button type="button" onClick={exportBackup}>Export</button>
        </div>
        <span style={hintStyle}>Download settings, history, and favourites as a JSON file</span>
      </div>

      <div style={rowStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Import backup</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => importBackup(e.target.files)}
            style={{ fontSize: 12, maxWidth: 200 }}
          />
        </div>
        <span style={hintStyle}>Merge a previously exported backup file into history and favourites</span>
      </div>

      <div style={rowStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Clear history</span>
          <button type="button" onClick={clearHistoryClick}>
            {confirmingClear ? 'Confirm clear?' : 'Clear history'}
          </button>
        </div>
        <span style={hintStyle}>Removes all download history. Favourites and settings are not affected.</span>
      </div>
    </div>
  );
}
