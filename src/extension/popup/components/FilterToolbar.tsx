import React, { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
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
  { value: 'all', label: 'Any' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const FilterToolbar: React.FC<FilterToolbarProps> = ({ onFilterChange, extensionSettings }) => {
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [moreOpen, setMoreOpen] = useState(false);

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
  // Filters tucked inside the "More" popover — its badge counts only these.
  const advancedCount =
    (filters.sizeBucket !== 'all' ? 1 : 0) +
    (filters.minSize > 0 ? 1 : 0) +
    (!filters.includeBase64 && !base64Disabled ? 1 : 0);
  const activeCount =
    (filters.mediaKind !== 'all' ? 1 : 0) + (filters.imageType !== 'all' ? 1 : 0) + advancedCount;

  const showSize = filters.mediaKind === 'all' || filters.mediaKind === 'image';

  return (
    <section className="border-b hairline bg-(--panel) px-4 py-2.5">
      {/* Primary line: Kind (segmented, one-tap) · Type (dropdown) · More (advanced).
          Wraps only if a narrow popup can't fit it all on one row. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow shrink-0">Filters</span>

        {/* Kind — single-choice segmented control, the primary filter. Even
            segments so the four options read as one uniform control. */}
        <div className="segwrap segwrap-even h-[28px] w-[204px] shrink-0" role="group" aria-label="Media kind">
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

        {/* Type — dropdown; options adapt to the selected kind. Height/width via
            inline style because .field (width:100%, height:34px) is defined after
            Tailwind and would otherwise win over h-/w- utilities. */}
        <select
          aria-label="Media format"
          value={filters.imageType}
          onChange={(e) => update({ imageType: e.target.value })}
          className="field shrink-0 py-0 text-[12px]"
          style={{ height: 28, width: 120 }}
        >
          {formatsForKind(filters.mediaKind).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value === 'all' ? 'All formats' : opt.label}
            </option>
          ))}
        </select>

        {/* More — discloses the advanced (size / min-size / base64) filters */}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-controls="filter-more"
          className={`chip shrink-0 ${moreOpen ? 'is-active' : ''}`}
          style={{ height: 28 }}
        >
          More
          {advancedCount > 0 && <span className="countpill">{advancedCount}</span>}
          <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>

        {activeCount > 0 && (
          <button
            onClick={reset}
            className="ml-auto shrink-0 text-[11px] font-semibold text-(--ink-2) transition-colors hover:text-(--ink)"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Advanced filters — shown when "More" is open. */}
      {moreOpen && (
        <div id="filter-more" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t hairline pt-3">
          {showSize && (
            <div className="flex items-center gap-2">
              <span className="eyebrow">Size</span>
              <div className="segwrap h-[28px]" role="group" aria-label="Image size">
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

          <label htmlFor="filter-min-size" className="flex items-center gap-1.5 text-[12px] text-(--ink-2)">
            <span className="whitespace-nowrap">Min</span>
            <input
              id="filter-min-size"
              type="number"
              min="0"
              value={filters.minSize || ''}
              placeholder="0"
              onChange={(e) => update({ minSize: parseInt(e.target.value, 10) || 0 })}
              className="field num text-right"
              style={{ height: 28, width: 56 }}
            />
            <span className="eyebrow">KB</span>
          </label>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-base64" className="text-[12px] text-(--ink-2)">
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
      )}
    </section>
  );
};

export default FilterToolbar;
