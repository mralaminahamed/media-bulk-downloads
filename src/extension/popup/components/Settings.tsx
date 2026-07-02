import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { BubbleCorner, SettingsData } from '@/types';

export interface SettingsProps {
  onClose: () => void;
  onSettingsChange: (newSettings: SettingsData) => void;
  settings: SettingsData;
}

const ToggleRow: React.FC<{ id: string; label: string; checked: boolean; onToggle: () => void }> = ({
  id,
  label,
  checked,
  onToggle,
}) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <label htmlFor={id} className="text-[13px] text-[var(--ink)]">
      {label}
    </label>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="switch"
    />
  </div>
);

const Settings: React.FC<SettingsProps> = ({ onClose, onSettingsChange, settings: initialSettings }) => {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const toggle = (name: keyof SettingsData) => {
    setSettings((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSave = () => {
    // Persistence is owned by the parent (App.handleSettingsChange).
    onSettingsChange(settings);
    onClose();
  };

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-[var(--ink)]/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="sheet-in flex h-full w-full max-w-[380px] flex-col bg-[var(--panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">Settings</h2>
            <p className="eyebrow mt-0.5">Preferences</p>
          </div>
          <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
            <XMarkIcon className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Downloads */}
          <section className="space-y-3">
            <span className="eyebrow">Downloads</span>
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Download Path:</span>
              <input
                type="text"
                name="downloadPath"
                value={settings.downloadPath}
                onChange={handleChange}
                placeholder="e.g. Images/Collected"
                className="field"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--ink-2)]">File Name Prefix:</span>
              <input
                type="text"
                name="fileNamePrefix"
                value={settings.fileNamePrefix}
                onChange={handleChange}
                className="field"
              />
            </label>
          </section>

          {/* Collection */}
          <section className="space-y-3">
            <span className="eyebrow">Collection</span>
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Minimum Image Size (px):</span>
              <input
                type="number"
                name="minimumImageSize"
                min="0"
                value={settings.minimumImageSize}
                onChange={handleChange}
                className="field num"
              />
            </label>
            <ToggleRow
              id="set-excludeBase64Images"
              label="Exclude Base64 Images"
              checked={settings.excludeBase64Images}
              onToggle={() => toggle('excludeBase64Images')}
            />
          </section>

          {/* Appearance */}
          <section className="space-y-3">
            <span className="eyebrow">Appearance</span>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Popup Width:</span>
                <input type="number" name="popupWidth" min="320" max="800" value={settings.popupWidth} onChange={handleChange} className="field num" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Popup Height:</span>
                <input type="number" name="popupHeight" min="400" max="600" value={settings.popupHeight} onChange={handleChange} className="field num" />
              </label>
            </div>
            <ToggleRow
              id="set-showImageCount"
              label="Show Image Count in Popup Icon"
              checked={settings.showImageCount}
              onToggle={() => toggle('showImageCount')}
            />
          </section>

          {/* On-page bubble */}
          <section className="space-y-3">
            <span className="eyebrow">On-page bubble</span>
            <ToggleRow
              id="set-bubbleEnabled"
              label="Show floating bubble on pages"
              checked={settings.bubbleEnabled}
              onToggle={() => toggle('bubbleEnabled')}
            />
            {settings.bubbleEnabled && (
              <>
                <label className="block">
                  <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Bubble Corner:</span>
                  <select
                    name="bubbleCorner"
                    value={settings.bubblePosition.corner}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        bubblePosition: { ...prev.bubblePosition, corner: e.target.value as BubbleCorner },
                      }))
                    }
                    className="field"
                  >
                    <option value="bottom-right">Bottom right</option>
                    <option value="bottom-left">Bottom left</option>
                    <option value="top-right">Top right</option>
                    <option value="top-left">Top left</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Bubble Width:</span>
                    <input type="number" name="bubbleWidth" min="320" max="900" value={settings.bubbleWidth} onChange={handleChange} className="field num" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] text-[var(--ink-2)]">Bubble Height:</span>
                    <input type="number" name="bubbleHeight" min="360" max="900" value={settings.bubbleHeight} onChange={handleChange} className="field num" />
                  </label>
                </div>
              </>
            )}
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              Drag the bubble on any page to fine-tune its position. Works everywhere the
              popup can run except restricted pages (chrome://, the Web Store, PDFs).
            </p>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t hairline px-4 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};

export default Settings;
