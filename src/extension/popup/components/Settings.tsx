import React, { useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { BubbleCorner, BubblePanelPlacement, SettingsData, SettingsProps } from '@/types';
import { expandPathTemplate, todayISO } from '@/extension/shared/paths';
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
