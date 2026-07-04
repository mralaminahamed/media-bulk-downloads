import React, { useState } from 'react';
import { FilterOptions, SettingsData } from '@/types';

interface FilterToolbarProps {
  onFilterChange: (filters: FilterOptions) => void;
  extensionSettings: SettingsData;
}

export const DEFAULT_FILTERS: FilterOptions = {
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

/** Thin vertical rule separating filter groups on the single toolbar line. */
const Divider: React.FC = () => <span aria-hidden className="h-5 w-px shrink-0 bg-[var(--line-strong)]" />;

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

  const showSize = filters.mediaKind === 'all' || filters.mediaKind === 'image';

  return (
    <section className="border-b hairline bg-[var(--panel)] px-4 py-2.5">
      {/* All filters on one horizontally-scrollable line. */}
      <div className="flex items-center gap-2">
        <span className="eyebrow shrink-0">Filters</span>

        <div className="scroll-thin -my-1 flex flex-1 items-center gap-2 overflow-x-auto py-1">
          {/* Kind — single-choice segmented control */}
          <div className="segwrap shrink-0" role="group" aria-label="Media kind">
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

          <Divider />

          {/* Type — quick chips, adapt to the selected kind */}
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Media format">
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

          {/* Size — single-choice segmented control (images only) */}
          {showSize && (
            <>
              <Divider />
              <div className="segwrap shrink-0" role="group" aria-label="Image size">
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
            </>
          )}

          <Divider />

          {/* Min size */}
          <label htmlFor="filter-min-size" className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--ink-2)]">
            <span className="whitespace-nowrap">Min</span>
            <input
              id="filter-min-size"
              type="number"
              min="0"
              value={filters.minSize || ''}
              placeholder="0"
              onChange={(e) => update({ minSize: parseInt(e.target.value, 10) || 0 })}
              className="field num h-[28px] w-[52px] text-right"
            />
            <span className="eyebrow">KB</span>
          </label>

          <Divider />

          {/* Base64 */}
          <div className="flex shrink-0 items-center gap-1.5">
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

        {/* Active-filter count + reset, pinned at the end (never scrolls away). */}
        {activeCount > 0 && <span className="countpill shrink-0">{activeCount}</span>}
        {activeCount > 0 && (
          <button
            onClick={reset}
            className="shrink-0 text-[11px] font-semibold text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
          >
            Clear all
          </button>
        )}
      </div>
    </section>
  );
};

export default FilterToolbar;
