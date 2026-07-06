import React, { useMemo, useRef, useState } from 'react';
import { XMarkIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { BubbleCorner, BubblePanelPlacement, SettingsData, SettingsProps } from '@/types';
import { expandPathTemplate, todayISO } from '@/extension/shared/collection/paths';
import { buildBackup, parseBackup } from '@/extension/shared/storage/backup';
import { loadFavourites } from '@/extension/shared/storage/favourites';
import { loadHistory } from '@/extension/shared/storage/history';
import { downloadText, sendRuntimeMessage } from '../utils';
import { useDialog } from '../hooks/useDialog';
import { TextField } from './fields/TextField';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { ToggleRow } from './fields/ToggleRow';
import { Section } from './fields/Section';

const Settings: React.FC<SettingsProps> = ({ onClose, onSettingsChange, settings: initialSettings }) => {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);
  const panelRef = useDialog(onClose);

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

  // Turning on completion toasts needs the optional `notifications` permission,
  // requested here inside the click's user gesture. Denied → the toggle stays off.
  const handleNotifyToggle = () => {
    if (settings.notifyOnComplete) {
      setSettings((prev) => ({ ...prev, notifyOnComplete: false }));
      return;
    }
    chrome.permissions.request({ permissions: ['notifications'] }, (granted) => {
      if (granted) setSettings((prev) => ({ ...prev, notifyOnComplete: true }));
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
    const [favourites, history] = await Promise.all([loadFavourites(), loadHistory()]);
    const backup = buildBackup(settings, favourites, history, new Date().toISOString());
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
    sendRuntimeMessage({ type: 'RESTORE_DATA', favourites: backup.favourites, history: backup.history });
    setBackupNote(`Imported settings, ${backup.favourites.length} favourites, and ${backup.history.length} history entries.`);
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-(--overlay) backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="sheet-in flex h-full w-full max-w-95 flex-col bg-(--panel) shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dotgrid flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 id="settings-title" className="text-[13px] font-semibold text-(--ink)">
              Settings
            </h2>
            <p className="eyebrow mt-0.5">Preferences</p>
          </div>
          <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
            <XMarkIcon className="h-4.5 w-4.5" />
          </button>
        </header>

        <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <Section title="Downloads">
            <TextField
              id="set-downloadPath"
              name="downloadPath"
              label="Save to subfolder (in Downloads):"
              value={settings.downloadPath}
              onChange={handleChange}
              placeholder="e.g. Media/{domain}"
              hint={folderPreview}
              hintClassName="num mt-1 block text-[11px] text-(--ink-3)"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-(--ink-3)">
              Tokens:{' '}
              <code className="num text-(--ink-2)">{'{host}'}</code>{' '}
              <code className="num text-(--ink-2)">{'{domain}'}</code>{' '}
              <code className="num text-(--ink-2)">{'{date}'}</code>{' '}
              <code className="num text-(--ink-2)">{'{kind}'}</code>{' '}
              — e.g. <code className="num text-(--ink-2)">Media/{'{domain}'}</code> saves each site to
              its own folder.
            </p>

            <ToggleRow
              id="set-saveAs"
              label="Ask where to save each file"
              checked={settings.saveAs}
              onToggle={() => toggle('saveAs')}
            />

            <ToggleRow
              id="set-notify"
              label="Notify when downloads finish"
              description="Show a desktop notification with the result of each download batch — handy for keyboard-shortcut and right-click downloads. Asks for notification permission the first time."
              checked={settings.notifyOnComplete}
              onToggle={handleNotifyToggle}
            />

            <div>
              <span id="naming-label" className="mb-1 block text-[12px] text-(--ink-2)">
                File naming:
              </span>
              <div className="segwrap" role="group" aria-labelledby="naming-label">
                {(['prefixed', 'original'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNaming(mode)}
                    className={`seg ${settings.namingMode === mode ? 'is-active' : ''}`}
                    aria-pressed={settings.namingMode === mode}
                  >
                    {mode === 'prefixed' ? 'Prefixed' : 'Original'}
                  </button>
                ))}
              </div>
            </div>

            {settings.namingMode === 'prefixed' && (
              <TextField
                id="set-fileNamePrefix"
                name="fileNamePrefix"
                label="File name prefix:"
                value={settings.fileNamePrefix}
                onChange={handleChange}
                hint="Numbered per file, e.g. image_1.jpg."
              />
            )}
          </Section>

          <Section title="Collection">
            <NumberField
              id="set-minimumImageSize"
              name="minimumImageSize"
              label="Minimum Image Size (px):"
              min={0}
              max={10000}
              value={settings.minimumImageSize}
              onChange={handleChange}
              onBlur={clampOnBlur('minimumImageSize', 0, 10000)}
            />
            <ToggleRow
              id="set-excludeBase64Images"
              label="Exclude Base64 Images"
              checked={settings.excludeBase64Images}
              onToggle={() => toggle('excludeBase64Images')}
            />
            <ToggleRow
              id="set-resolveOriginals"
              label="Resolve exact originals (network requests)"
              description="Fetches Twitter videos and exact Wallhaven/Unsplash originals. Off by default — keeps collection private."
              checked={settings.resolveOriginals}
              onToggle={() => toggle('resolveOriginals')}
            />
          </Section>

          <Section title="Deep scan">
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id="set-deepScanMaxItems"
                name="deepScanMaxItems"
                label="Max items:"
                min={50}
                max={5000}
                value={settings.deepScanMaxItems}
                onChange={handleChange}
                onBlur={clampOnBlur('deepScanMaxItems', 50, 5000)}
              />
              <NumberField
                id="set-deepScanMaxSeconds"
                name="deepScanMaxSeconds"
                label="Max time (seconds):"
                min={5}
                max={120}
                value={settings.deepScanMaxSeconds}
                onChange={handleChange}
                onBlur={clampOnBlur('deepScanMaxSeconds', 5, 120)}
              />
            </div>
            <NumberField
              id="set-deepScanMaxScrolls"
              name="deepScanMaxScrolls"
              label="Max scroll steps:"
              min={5}
              max={200}
              value={settings.deepScanMaxScrolls}
              onChange={handleChange}
              onBlur={clampOnBlur('deepScanMaxScrolls', 5, 200)}
            />
            <ToggleRow
              id="set-deepScanClickLoadMore"
              label="Click “Load more” buttons"
              description="Lets deep scan click Load more / Show more buttons to reveal more media. Off by default — clicking page controls can have side effects."
              checked={settings.deepScanClickLoadMore}
              onToggle={() => toggle('deepScanClickLoadMore')}
            />
          </Section>

          <Section title="Appearance">
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id="set-popupWidth"
                name="popupWidth"
                label="Popup Width:"
                min={320}
                max={800}
                value={settings.popupWidth}
                onChange={handleChange}
                onBlur={clampOnBlur('popupWidth', 320, 800)}
              />
              <NumberField
                id="set-popupHeight"
                name="popupHeight"
                label="Popup Height:"
                min={400}
                max={600}
                value={settings.popupHeight}
                onChange={handleChange}
                onBlur={clampOnBlur('popupHeight', 400, 600)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id="set-thumbnailSize"
                name="thumbnailSize"
                label="Thumbnail Size (px):"
                min={64}
                max={240}
                value={settings.thumbnailSize}
                onChange={handleChange}
                onBlur={clampOnBlur('thumbnailSize', 64, 240)}
              />
              <NumberField
                id="set-previewSize"
                name="previewSize"
                label="Preview Size (px):"
                min={240}
                max={900}
                value={settings.previewSize}
                onChange={handleChange}
                onBlur={clampOnBlur('previewSize', 240, 900)}
              />
            </div>
            <ToggleRow
              id="set-showImageCount"
              label="Show Image Count in Popup Icon"
              checked={settings.showImageCount}
              onToggle={() => toggle('showImageCount')}
            />
          </Section>

          <Section title="On-page bubble">
            <ToggleRow
              id="set-bubbleEnabled"
              label="Show floating bubble on pages"
              checked={settings.bubbleEnabled}
              onToggle={() => toggle('bubbleEnabled')}
            />
            {settings.bubbleEnabled && (
              <>
                <SelectField
                  id="set-bubbleCorner"
                  name="bubbleCorner"
                  label="Bubble Corner:"
                  value={settings.bubblePosition.corner}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      bubblePosition: { ...prev.bubblePosition, corner: e.target.value as BubbleCorner },
                    }))
                  }
                >
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="top-right">Top right</option>
                  <option value="top-left">Top left</option>
                </SelectField>
                <SelectField
                  id="set-bubblePanelPlacement"
                  name="bubblePanelPlacement"
                  label="Panel Position:"
                  value={settings.bubblePanelPlacement}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      bubblePanelPlacement: e.target.value as BubblePanelPlacement,
                    }))
                  }
                >
                  <option value="anchored">Next to button</option>
                  <option value="center">Center of screen</option>
                  <option value="free">Custom (drag panel header)</option>
                  <option value="bottom-right">Corner · bottom right</option>
                  <option value="bottom-left">Corner · bottom left</option>
                  <option value="top-right">Corner · top right</option>
                  <option value="top-left">Corner · top left</option>
                </SelectField>
                <p className="text-[11px] leading-relaxed text-(--ink-3)">
                  Tip: drag the panel by its header on any page to drop it exactly where you want.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id="set-bubbleWidth"
                    name="bubbleWidth"
                    label="Bubble Width:"
                    min={320}
                    max={3840}
                    value={settings.bubbleWidth}
                    onChange={handleChange}
                    onBlur={clampOnBlur('bubbleWidth', 320, 3840)}
                  />
                  <NumberField
                    id="set-bubbleHeight"
                    name="bubbleHeight"
                    label="Bubble Height:"
                    min={360}
                    max={2160}
                    value={settings.bubbleHeight}
                    onChange={handleChange}
                    onBlur={clampOnBlur('bubbleHeight', 360, 2160)}
                  />
                </div>
              </>
            )}
            <p className="text-[11px] leading-relaxed text-(--ink-3)">
              Drag the bubble on any page to fine-tune its position. Works everywhere the
              popup can run except restricted pages (chrome://, the Web Store, PDFs).
            </p>
          </Section>

          <Section title="Backup">
            <p className="text-[11px] leading-relaxed text-(--ink-3)">
              Save your settings, favourites, and history to a JSON file, or restore from a
              previous backup. Importing <strong>replaces</strong> your current favourites and
              history. Everything stays on your device.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void handleExportBackup()} className="btn btn-ghost btn-sm">
                <ArrowDownTrayIcon className="h-4 w-4" />
                <span>Export backup</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost btn-sm">
                <ArrowUpTrayIcon className="h-4 w-4" />
                <span>Import backup</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleImportBackup(e)}
                className="hidden"
              />
            </div>
            {backupNote && (
              <p aria-live="polite" className="text-[11px] text-(--ink-2)">
                {backupNote}
              </p>
            )}
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t hairline px-4 py-3">
          <span aria-live="polite" className="text-[11px] text-(--ink-3)">
            {dirty ? 'Unsaved changes' : ''}
          </span>
          <div className="flex gap-2">
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
