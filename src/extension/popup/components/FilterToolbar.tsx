import React, { useState } from 'react';
import { FilterOptions, SettingsData } from '@/types';

interface FilterToolbarProps {
  onFilterChange: (filters: FilterOptions) => void;
  extensionSettings: SettingsData;
}

const DEFAULT_FILTERS: FilterOptions = {
  mediaKind: 'all',
  imageType: 'all',
  minSize: 0,
  includeBase64: true,
  sizeBucket: 'all',
};

const KIND_OPTIONS: { value: FilterOptions['mediaKind']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
];

const IMAGE_FORMATS = [
  { value: 'all', label: 'All' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'gif', label: 'GIF' },
  { value: 'svg', label: 'SVG' },
  { value: 'webp', label: 'WebP' },
];
const VIDEO_FORMATS = [
  { value: 'all', label: 'All' },
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'ogg', label: 'OGG' },
  { value: 'mov', label: 'MOV' },
];
const AUDIO_FORMATS = [
  { value: 'all', label: 'All' },
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg', label: 'OGG' },
  { value: 'm4a', label: 'M4A' },
  { value: 'flac', label: 'FLAC' },
];

const formatsForKind = (kind: FilterOptions['mediaKind']) =>
  kind === 'video' ? VIDEO_FORMATS : kind === 'audio' ? AUDIO_FORMATS : IMAGE_FORMATS;

const SIZE_OPTIONS: { value: 'all' | 'small' | 'medium' | 'large'; label: string }[] = [
  { value: 'all', label: 'Any size' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const FilterToolbar: React.FC<FilterToolbarProps> = ({ onFilterChange, extensionSettings }) => {
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);

  const update = (patch: Partial<FilterOptions>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onFilterChange(next);
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    onFilterChange(DEFAULT_FILTERS);
  };

  const base64Disabled = extensionSettings.excludeBase64Images;
  const activeCount =
    (filters.mediaKind !== 'all' ? 1 : 0) +
    (filters.imageType !== 'all' ? 1 : 0) +
    (filters.sizeBucket !== 'all' ? 1 : 0) +
    (filters.minSize > 0 ? 1 : 0) +
    (!filters.includeBase64 && !base64Disabled ? 1 : 0);

  return (
    <section className="border-b hairline bg-[var(--panel)] px-4 py-3">
      {/* Section header — label, live active-filter count, reset */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="eyebrow">Filters</span>
        {activeCount > 0 && <span className="countpill">{activeCount} active</span>}
        {activeCount > 0 && (
          <button
            onClick={reset}
            className="ml-auto text-[11px] font-semibold text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Kind — single-choice segmented control */}
        <div className="flex items-center gap-2.5">
          <span className="eyebrow w-9 shrink-0">Kind</span>
          <div className="segwrap" role="group" aria-label="Media kind">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ mediaKind: opt.value, imageType: 'all' })}
                className={`seg ${filters.mediaKind === opt.value ? 'is-active' : ''}`}
                aria-pressed={filters.mediaKind === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type — scrollable quick chips, adapt to the selected kind */}
        <div className="flex items-center gap-2.5">
          <span className="eyebrow w-9 shrink-0">Type</span>
          <div
            className="scroll-thin -my-1 flex flex-1 gap-1.5 overflow-x-auto py-1"
            role="group"
            aria-label="Media format"
          >
            {formatsForKind(filters.mediaKind).map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ imageType: opt.value })}
                className={`chip ${filters.imageType === opt.value ? 'is-active' : ''}`}
                aria-pressed={filters.imageType === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Size — single-choice segmented control (images only) */}
        {(filters.mediaKind === 'all' || filters.mediaKind === 'image') && (
          <div className="flex items-center gap-2.5">
            <span className="eyebrow w-9 shrink-0">Size</span>
            <div className="segwrap" role="group" aria-label="Image size">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ sizeBucket: opt.value })}
                  className={`seg ${filters.sizeBucket === opt.value ? 'is-active' : ''}`}
                  aria-pressed={filters.sizeBucket === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Advanced controls — min size + base64, set apart by a hairline */}
      <div className="mt-3 flex items-center gap-3 border-t hairline pt-3">
        <label htmlFor="filter-min-size" className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
          <span className="whitespace-nowrap">Min size</span>
          <span className="flex items-center gap-1.5">
            <input
              id="filter-min-size"
              type="number"
              min="0"
              value={filters.minSize || ''}
              placeholder="0"
              onChange={(e) => update({ minSize: parseInt(e.target.value, 10) || 0 })}
              className="field num h-[30px] w-[60px] text-right"
            />
            <span className="eyebrow">KB</span>
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="filter-base64" className="text-[12px] text-[var(--ink-2)]">
            Base64
          </label>
          <button
            id="filter-base64"
            type="button"
            role="switch"
            aria-checked={!base64Disabled && filters.includeBase64}
            aria-label="Include Base64 images"
            disabled={base64Disabled}
            onClick={() => update({ includeBase64: !filters.includeBase64 })}
            className="switch"
          />
        </div>
      </div>
    </section>
  );
};

export default FilterToolbar;
