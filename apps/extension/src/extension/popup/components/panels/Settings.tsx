import React, { useEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { SettingsData, SettingsProps } from '@mbd/core/types';
import { expandPathTemplate, todayISO } from '@mbd/core/collection/paths';
import { buildBackup, parseBackup } from '@mbd/storage/backup';
import { loadFavourites } from '@mbd/storage/favourites';
import { loadHistory } from '@mbd/storage/history';
import { loadExcluded } from '@mbd/storage/excluded';
import { DEFAULT_SETTINGS } from '@mbd/storage/settings';
import { downloadText, sendRuntimeMessage } from '@/extension/popup/utils';
import { useDialog } from '@/extension/popup/hooks/useDialog';
import DownloadsPane from '@/extension/popup/components/panels/settings/DownloadsPane';
import MediaPane from '@/extension/popup/components/panels/settings/MediaPane';
import DisplayPane from '@/extension/popup/components/panels/settings/DisplayPane';
import DataPane from '@/extension/popup/components/panels/settings/DataPane';
import { SettingsTabs, SettingsTab } from '@/extension/popup/components/panels/settings/SettingsTabs';

const TABS: SettingsTab[] = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'media', label: 'Media' },
  { id: 'display', label: 'Display' },
  { id: 'data', label: 'Data' },
];

const Settings: React.FC<SettingsProps> = ({ onClose, onSettingsChange, settings: initialSettings, perHost }) => {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);
  const [activeTab, setActiveTab] = useState('downloads');
  const [siteNote, setSiteNote] = useState('');
  const panelRef = useDialog(onClose);

  const externalRef = useRef<SettingsData>(initialSettings);
  useEffect(() => {
    setSettings((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(initialSettings) as (keyof SettingsData)[]) {
        const untouched = JSON.stringify(prev[key]) === JSON.stringify(externalRef.current[key]);
        if (untouched && JSON.stringify(prev[key]) !== JSON.stringify(initialSettings[key])) {
          (next as Record<string, unknown>)[key] = initialSettings[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    externalRef.current = initialSettings;
  }, [initialSettings]);

  const isNonDefault = (keys: (keyof SettingsData)[]) =>
    keys.some((k) => JSON.stringify(initialSettings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k]));
  const downloadsAdvOpen = isNonDefault(['downloadConcurrency', 'notifyOnComplete', 'nearDuplicateThreshold']);
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

  const persistNotify = (value: boolean) => {
    setSettings((prev) => ({ ...prev, notifyOnComplete: value }));
    sendRuntimeMessage({ type: 'SET_SETTINGS', patch: { notifyOnComplete: value } });
  };

  const handleNotifyToggle = () => {
    if (settings.notifyOnComplete) {
      persistNotify(false);
      return;
    }
    persistNotify(true);
    chrome.permissions.request({ permissions: ['notifications'] }, (granted) => {
      if (!granted) persistNotify(false);
    });
  };

  const folderPreview = (() => {
    const dir = expandPathTemplate(settings.downloadPath, {
      host: 'www.example.com',
      domain: 'example.com',
      date: todayISO(),
      kind: 'image',
    });
    return dir ? `Downloads/${dir}/image.jpg` : 'Downloads/image.jpg';
  })();

  const handleSave = () => {
    const delta: Partial<SettingsData> = {};
    for (const key of Object.keys(settings) as (keyof SettingsData)[]) {
      if (JSON.stringify(settings[key]) !== JSON.stringify(initialSettings[key])) {
        (delta as Record<string, unknown>)[key] = settings[key];
      }
    }
    onSettingsChange({ ...initialSettings, ...delta });
    onClose();
  };

  const handleSaveForSite = () => {
    perHost?.onSaveForSite(settings);
    setSiteNote(`Saved for ${perHost?.host}`);
  };

  const handleResetSite = () => {
    perHost?.onResetSite();
    setSiteNote(`Reset ${perHost?.host}`);
  };

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
    e.target.value = '';
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) {
      setBackupNote('That file is not a valid Media Bulk Downloads backup.');
      return;
    }
    setSettings(backup.settings);
    onSettingsChange(backup.settings);
    sendRuntimeMessage({ type: 'RESTORE_DATA', favourites: backup.favourites, history: backup.history, excluded: backup.excluded });
    setBackupNote(`Imported settings, ${backup.favourites.length} favourites, ${backup.history.length} history entries, and ${backup.excluded.length} blocked sources.`);
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
    setBackupNote('Settings reset to defaults.');
  };

  const handleClearData = () => {
    sendRuntimeMessage({ type: 'CLEAR_FAVOURITES' });
    sendRuntimeMessage({ type: 'CLEAR_HISTORY' });
    sendRuntimeMessage({ type: 'CLEAR_EXCLUDED' });
    setBackupNote('Cleared favourites, history, and blocked sources.');
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
              onResetSettings={handleResetSettings}
              onClearData={handleClearData}
            />
          )}
        </div>

        {perHost && (
          <div className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-2 mbd:border-t hairline mbd:px-4 mbd:py-2.5">
            <div className="mbd:min-w-0">
              <p className="mbd:truncate mbd:text-[12px] mbd:font-medium mbd:text-(--ink)">
                {perHost.host ? `Preferences for ${perHost.host}` : 'This site'}
              </p>
              <p aria-live="polite" className="eyebrow mbd:mt-0.5">
                {siteNote || (perHost.host ? 'Remember these for this site only' : 'No active site')}
              </p>
            </div>
            <div className="mbd:flex mbd:shrink-0 mbd:gap-2">
              {perHost.hasOverride && (
                <button onClick={handleResetSite} disabled={!perHost.host} className="btn btn-ghost">
                  Reset this site
                </button>
              )}
              <button onClick={handleSaveForSite} disabled={!perHost.host} className="btn btn-ghost">
                Save for this site
              </button>
            </div>
          </div>
        )}

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
