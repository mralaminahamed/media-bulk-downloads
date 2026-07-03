import React, { useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { BubbleCorner, BubblePanelPlacement, SettingsData } from '@/types';
import { sanitizePathSegment } from '@/extension/shared/paths';
import { useDialog } from '../hooks/useDialog';

export interface SettingsProps {
  onClose: () => void;
  onSettingsChange: (newSettings: SettingsData) => void;
  settings: SettingsData;
}

const hintId = (id: string) => `${id}-hint`;

/** Label + text input, with an optional described hint. */
const TextField: React.FC<{
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  hintClassName?: string;
}> = ({ id, name, label, value, onChange, placeholder, hint, hintClassName }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-[12px] text-[var(--ink-2)]">
      {label}
    </label>
    <input
      id={id}
      type="text"
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="field"
      aria-describedby={hint ? hintId(id) : undefined}
    />
    {hint && (
      <span id={hintId(id)} className={hintClassName ?? 'mt-1 block text-[11px] text-[var(--ink-3)]'}>
        {hint}
      </span>
    )}
  </div>
);

/** Label + number input that clamps to [min, max] on blur. */
const NumberField: React.FC<{
  id: string;
  name: string;
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}> = ({ id, name, label, value, min, max, onChange, onBlur }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-[12px] text-[var(--ink-2)]">
      {label}
    </label>
    <input
      id={id}
      type="number"
      name={name}
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className="field num"
    />
  </div>
);

/** Label + native select. */
const SelectField: React.FC<{
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}> = ({ id, name, label, value, onChange, children }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-[12px] text-[var(--ink-2)]">
      {label}
    </label>
    <select id={id} name={name} value={value} onChange={onChange} className="field">
      {children}
    </select>
  </div>
);

const ToggleRow: React.FC<{
  id: string;
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}> = ({ id, label, description, checked, onToggle }) => (
  <div className="py-1.5">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[13px] text-[var(--ink)]">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={onToggle}
        className="switch"
      />
    </div>
    {description && (
      <p id={`${id}-desc`} className="mt-1 pr-12 text-[11px] leading-relaxed text-[var(--ink-3)]">
        {description}
      </p>
    )}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <span className="eyebrow block border-b hairline pb-2">{title}</span>
    {children}
  </section>
);

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
    const dir = sanitizePathSegment(settings.downloadPath);
    return dir ? `Downloads/${dir}/image.jpg` : 'Downloads/image.jpg';
  })();

  const handleSave = () => {
    // Persistence is owned by the parent (App.handleSettingsChange).
    onSettingsChange(settings);
    onClose();
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-[var(--overlay)] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="sheet-in flex h-full w-full max-w-[380px] flex-col bg-[var(--panel)] shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dotgrid flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 id="settings-title" className="text-[13px] font-semibold text-[var(--ink)]">
              Settings
            </h2>
            <p className="eyebrow mt-0.5">Preferences</p>
          </div>
          <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
            <XMarkIcon className="h-[18px] w-[18px]" />
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
              placeholder="e.g. Images/Collected"
              hint={folderPreview}
              hintClassName="num mt-1 block text-[11px] text-[var(--ink-3)]"
            />

            <ToggleRow
              id="set-saveAs"
              label="Ask where to save each file"
              checked={settings.saveAs}
              onToggle={() => toggle('saveAs')}
            />

            <div>
              <span id="naming-label" className="mb-1 block text-[12px] text-[var(--ink-2)]">
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
                <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
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
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              Drag the bubble on any page to fine-tune its position. Works everywhere the
              popup can run except restricted pages (chrome://, the Web Store, PDFs).
            </p>
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t hairline px-4 py-3">
          <span aria-live="polite" className="text-[11px] text-[var(--ink-3)]">
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
