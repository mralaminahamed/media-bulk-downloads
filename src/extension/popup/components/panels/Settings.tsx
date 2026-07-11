import React, { useMemo, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { SettingsData, SettingsProps } from '@/types';
import { expandPathTemplate, todayISO } from '@/extension/shared/collection/paths';
import { buildBackup, parseBackup } from '@/extension/shared/storage/backup';
import { loadFavourites } from '@/extension/shared/storage/favourites';
import { loadHistory } from '@/extension/shared/storage/history';
import { loadExcluded } from '@/extension/shared/storage/excluded';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import { downloadText, sendRuntimeMessage } from '../../utils';
import { useDialog } from '../../hooks/useDialog';
import DownloadsPane from './settings/DownloadsPane';
import MediaPane from './settings/MediaPane';
import DisplayPane from './settings/DisplayPane';
import DataPane from './settings/DataPane';
import { SettingsTabs, SettingsTab } from './settings/SettingsTabs';

const TABS: SettingsTab[] = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'media', label: 'Media' },
  { id: 'display', label: 'Display' },
  { id: 'data', label: 'Data' },
];

const Settings: React.FC<SettingsProps> = ({ onClose, onSettingsChange, settings: initialSettings }) => {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);
  const [activeTab, setActiveTab] = useState('downloads');
  const panelRef = useDialog(onClose);

  // Auto-expand a pane's Advanced section when the sheet opens with any of its
  // fields already non-default, so a set value is never hidden. Seed from the
  // INITIAL settings (not live edits) so typing does not re-open it.
  const isNonDefault = (keys: (keyof SettingsData)[]) =>
    keys.some((k) => JSON.stringify(initialSettings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k]));
  const downloadsAdvOpen = isNonDefault(['downloadConcurrency', 'notifyOnComplete']);
  const mediaAdvOpen = isNonDefault(['deepScanMaxItems', 'deepScanMaxSeconds', 'deepScanMaxScrolls', 'deepScanClickLoadMore']);
  const displayAdvOpen = isNonDefault(['popupWidth', 'popupHeight', 'previewSize', 'bubbleWidth', 'bubbleHeight']);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initialSettings),
    [settings, initialSettings],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  // Clamp a number field to its declared bounds once the user leaves it — kept
  // off the keystroke path so intermediate values stay editable while typing.
  const clampOnBlur =
    (name: keyof SettingsData, min: number, max = Number.POSITIVE_INFINITY) =>
    (e: React.FocusEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
      setSettings((prev) => ({ ...prev, [name]: clamped }));
    };

  const toggle = (name: keyof SettingsData) => {
    setSettings((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const setNaming = (mode: SettingsData['namingMode']) => {
    setSettings((prev) => ({ ...prev, namingMode: mode }));
  };

  // Persist notifyOnComplete straight to storage (a single-field SET_SETTINGS
  // patch), NOT just to local state gated behind the Save button. Turning it on
  // triggers the optional `notifications` permission prompt, and Chrome closes the
  // action popup when that prompt takes focus — which would drop both the grant
  // callback and the unsaved toggle, so Save is never reachable. Writing now makes
  // enabling survive the popup closing.
  const persistNotify = (value: boolean) => {
    setSettings((prev) => ({ ...prev, notifyOnComplete: value }));
    sendRuntimeMessage({ type: 'SET_SETTINGS', patch: { notifyOnComplete: value } });
  };

  // Turning on completion toasts needs the optional `notifications` permission,
  // requested here inside the click's user gesture.
  const handleNotifyToggle = () => {
    if (settings.notifyOnComplete) {
      persistNotify(false);
      return;
    }
    // Persist the ON intent BEFORE the prompt (which may close the popup), then
    // request. If the popup survives and the user denies, roll back. Persisting
    // "on but not yet granted" is harmless: notifyBatchDone no-ops until the
    // permission is actually present.
    persistNotify(true);
    chrome.permissions.request({ permissions: ['notifications'] }, (granted) => {
      if (!granted) persistNotify(false);
    });
  };

  const folderPreview = (() => {
    // Resolve the template against a sample site so tokens render in the preview.
    const dir = expandPathTemplate(settings.downloadPath, {
      host: 'www.example.com',
      domain: 'example.com',
      date: todayISO(),
      kind: 'image',
    });
    return dir ? `Downloads/${dir}/image.jpg` : 'Downloads/image.jpg';
  })();

  const handleSave = () => {
    // Persistence is owned by the parent (App.handleSettingsChange).
    onSettingsChange(settings);
    onClose();
  };

  // ── Backup (export / import all data) ───────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupNote, setBackupNote] = useState('');

  const handleExportBackup = async () => {
    const [favourites, history, excluded] = await Promise.all([loadFavourites(), loadHistory(), loadExcluded()]);
    const backup = buildBackup(settings, favourites, history, excluded, new Date().toISOString());
    downloadText(`media-bulk-downloads-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    setBackupNote('Backup exported.');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again later
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) {
      setBackupNote('That file is not a valid Media Bulk Downloads backup.');
      return;
    }
    // Settings apply locally + persist; favourites/history replace via the
    // background (single-writer).
    setSettings(backup.settings);
    onSettingsChange(backup.settings);
    sendRuntimeMessage({ type: 'RESTORE_DATA', favourites: backup.favourites, history: backup.history, excluded: backup.excluded });
    setBackupNote(`Imported settings, ${backup.favourites.length} favourites, ${backup.history.length} history entries, and ${backup.excluded.length} blocked sources.`);
  };

  return (
    <div
      className="overlay-in mbd:fixed mbd:inset-0 mbd:z-50 mbd:flex mbd:items-stretch mbd:justify-end mbd:bg-(--overlay) mbd:backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="sheet-in mbd:flex mbd:h-full mbd:w-full mbd:max-w-95 mbd:flex-col mbd:bg-(--panel) mbd:shadow-2xl mbd:focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dotgrid mbd:flex mbd:items-center mbd:justify-between mbd:border-b hairline mbd:px-4 mbd:py-3">
          <div>
            <h2 id="settings-title" className="mbd:text-[13px] mbd:font-semibold mbd:text-(--ink)">
              Settings
            </h2>
            <p className="eyebrow mbd:mt-0.5">Preferences</p>
          </div>
          <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
            <XMarkIcon className="mbd:h-4.5 mbd:w-4.5" />
          </button>
        </header>

        <SettingsTabs tabs={TABS} active={activeTab} onSelect={setActiveTab} />
        <div className="scroll-thin mbd:flex-1 mbd:overflow-y-auto mbd:px-4 mbd:py-4">
          {activeTab === 'downloads' && (
            <DownloadsPane
              settings={settings}
              handleChange={handleChange}
              clampOnBlur={clampOnBlur}
              toggle={toggle}
              setSettings={setSettings}
              advancedDefaultOpen={downloadsAdvOpen}
              folderPreview={folderPreview}
              onNotifyToggle={handleNotifyToggle}
              setNaming={setNaming}
            />
          )}
          {activeTab === 'media' && (
            <MediaPane
              settings={settings}
              handleChange={handleChange}
              clampOnBlur={clampOnBlur}
              toggle={toggle}
              setSettings={setSettings}
              advancedDefaultOpen={mediaAdvOpen}
            />
          )}
          {activeTab === 'display' && (
            <DisplayPane
              settings={settings}
              handleChange={handleChange}
              clampOnBlur={clampOnBlur}
              toggle={toggle}
              setSettings={setSettings}
              advancedDefaultOpen={displayAdvOpen}
            />
          )}
          {activeTab === 'data' && (
            <DataPane
              onExport={() => void handleExportBackup()}
              onImportFile={(e) => void handleImportBackup(e)}
              fileInputRef={fileInputRef}
              backupNote={backupNote}
            />
          )}
        </div>

        <footer className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-2 mbd:border-t hairline mbd:px-4 mbd:py-3">
          <span aria-live="polite" className="mbd:text-[11px] mbd:text-(--ink-3)">
            {dirty ? 'Unsaved changes' : ''}
          </span>
          <div className="mbd:flex mbd:gap-2">
            <button onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary" disabled={!dirty}>
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Settings;
