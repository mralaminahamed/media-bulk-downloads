import React, { useState } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/react/24/outline';
import { FilterOptions, SettingsData } from '@/types';
import ChipFlyout from './ChipFlyout';
import FilterChip from './FilterChip';

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
  downloadState: 'all',
  search: '',
  sortBy: 'default',
  sortDir: 'desc',
};

const SORT_OPTIONS: { value: FilterOptions['sortBy']; label: string }[] = [
  { value: 'default', label: 'Sort: Default' },
  { value: 'name', label: 'Sort: Name' },
  { value: 'size', label: 'Sort: Size' },
  { value: 'dimensions', label: 'Sort: Dimensions' },
  { value: 'type', label: 'Sort: Type' },
];

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

const STATE_OPTIONS: { value: FilterOptions['downloadState']; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'not-downloaded', label: 'Not downloaded' },
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
  // Filters tucked inside the "More" popover — its badge counts only Format/Size/Min/Base64.
  // Downloaded state lives in its own primary-row State chip (below), so it's
  // intentionally excluded from this badge.
  const advancedCount =
    (filters.imageType !== 'all' ? 1 : 0) +
    (filters.sizeBucket !== 'all' ? 1 : 0) +
    (filters.minSize > 0 ? 1 : 0) +
    (!filters.includeBase64 && !base64Disabled ? 1 : 0);
  const activeCount =
    (filters.mediaKind !== 'all' ? 1 : 0) +
    advancedCount +
    (filters.downloadState !== 'all' ? 1 : 0) +
    (filters.search.trim() ? 1 : 0) +
    (filters.sortBy !== 'default' ? 1 : 0);

  const showSize = filters.mediaKind === 'all' || filters.mediaKind === 'image';

  // Active advanced filters mirrored as removable chips (they are SET inside More).
  const advChips: { key: string; label: string; clear: () => void }[] = [
    filters.imageType !== 'all' && {
      key: 'format',
      label: formatsForKind(filters.mediaKind).find((o) => o.value === filters.imageType)?.label ?? filters.imageType.toUpperCase(),
      clear: () => update({ imageType: 'all' }),
    },
    filters.sizeBucket !== 'all' && { key: 'size', label: SIZE_OPTIONS.find((o) => o.value === filters.sizeBucket)!.label, clear: () => update({ sizeBucket: 'all' }) },
    filters.minSize > 0 && { key: 'min', label: `≥ ${filters.minSize} KB`, clear: () => update({ minSize: 0 }) },
    !filters.includeBase64 && !base64Disabled && { key: 'base64', label: 'No Base64', clear: () => update({ includeBase64: true }) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const sortDirLabel = filters.sortDir === 'asc' ? 'Ascending' : 'Descending';

  return (
    <section className="mbd:border-b hairline mbd:bg-(--panel) mbd:px-4 mbd:py-2.5">
      {/* Search + sort row: free-text query over the shown grid, plus an order
          control. Wraps on very narrow popups. */}
      <div className="mbd:mb-2.5 mbd:flex mbd:flex-wrap mbd:items-center mbd:gap-2">
        <label className="mbd:relative mbd:min-w-[140px] mbd:flex-1">
          <MagnifyingGlassIcon className="mbd:pointer-events-none mbd:absolute mbd:top-1/2 mbd:left-2.5 mbd:h-4 mbd:w-4 mbd:-translate-y-1/2 mbd:text-(--ink-3)" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search media…"
            aria-label="Search media"
            title="Search media"
            className="field mbd:w-full mbd:text-[12px]"
          />
        </label>
        <select
          aria-label="Sort order"
          title="Sort order"
          value={filters.sortBy}
          onChange={(e) => update({ sortBy: e.target.value as FilterOptions['sortBy'] })}
          className="field mbd:shrink-0 mbd:py-0 mbd:text-[12px]"
          style={{ height: 30, width: 150 }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => update({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
          disabled={filters.sortBy === 'default'}
          className="iconbtn iconbtn-sm mbd:shrink-0 mbd:disabled:opacity-40"
          aria-label={`Sort direction: ${sortDirLabel}`}
          title={sortDirLabel}
        >
          {filters.sortDir === 'asc' ? <BarsArrowUpIcon className="mbd:h-4 mbd:w-4" /> : <BarsArrowDownIcon className="mbd:h-4 mbd:w-4" />}
        </button>
      </div>

      {/* Primary line: Kind (segmented, one-tap) · Type (dropdown) · More (advanced).
          Wraps only if a narrow popup can't fit it all on one row. */}
      <div className="mbd:flex mbd:flex-wrap mbd:items-center mbd:gap-2">
        <span className="eyebrow mbd:shrink-0">Filters</span>

        {/* Kind — single-choice segmented control, the primary filter. Even
            segments so the four options read as one uniform control. */}
        <div className="segwrap segwrap-even mbd:h-[28px] mbd:w-[204px] mbd:shrink-0" role="group" aria-label="Media kind">
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

        {/* State — download status. Single-select chip flyout in the primary row
            (promoted out of "More"; see ChipFlyout). */}
        <ChipFlyout
          id="filter-state-flyout"
          triggerLabel="State"
          valueLabel={(v) => STATE_OPTIONS.find((o) => o.value === v)!.label}
          options={STATE_OPTIONS}
          value={filters.downloadState}
          defaultValue="all"
          onChange={(v) => update({ downloadState: v })}
          clearLabel="Remove State filter"
        />

        {advChips.map((c) => (
          <FilterChip
            key={c.key}
            label={c.label}
            active
            onOpen={() => setMoreOpen(true)}
            onClear={c.clear}
            clearLabel={`Remove ${c.key === 'base64' ? 'Base64' : c.key === 'min' ? 'Min size' : c.key === 'format' ? 'Format' : 'Size'} filter`}
          />
        ))}

        {/* More — discloses the advanced (format / size / min-size / base64) filters */}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-controls="filter-more"
          className={`chip mbd:shrink-0 ${moreOpen ? 'is-active' : ''}`}
          style={{ height: 28 }}
        >
          More
          {advancedCount > 0 && <span className="countpill">{advancedCount}</span>}
          <ChevronDownIcon className={`mbd:h-3.5 mbd:w-3.5 mbd:transition-transform ${moreOpen ? 'mbd:rotate-180' : ''}`} />
        </button>

        {activeCount > 0 && (
          <button
            onClick={reset}
            className="mbd:ml-auto mbd:shrink-0 mbd:text-[11px] mbd:font-semibold mbd:text-(--ink-2) mbd:transition-colors mbd:hover:text-(--ink)"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Advanced filters — shown when "More" is open. */}
      {moreOpen && (
        <div id="filter-more" className="mbd:mt-3 mbd:flex mbd:flex-wrap mbd:items-center mbd:gap-x-4 mbd:gap-y-2 mbd:border-t hairline mbd:pt-3">
          <label className="mbd:flex mbd:items-center mbd:gap-2 mbd:text-[12px] mbd:text-(--ink-2)">
            <span className="eyebrow">Format</span>
            <select
              aria-label="Media format"
              title="Media format"
              value={filters.imageType}
              onChange={(e) => update({ imageType: e.target.value })}
              className="field mbd:shrink-0 mbd:py-0 mbd:text-[12px]"
              style={{ height: 28, width: 120 }}
            >
              {formatsForKind(filters.mediaKind).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === 'all' ? 'All formats' : opt.label}
                </option>
              ))}
            </select>
          </label>

          {showSize && (
            <div className="mbd:flex mbd:items-center mbd:gap-2">
              <span className="eyebrow">Size</span>
              <div className="segwrap mbd:h-[28px]" role="group" aria-label="Image size">
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

          <label htmlFor="filter-min-size" className="mbd:flex mbd:items-center mbd:gap-1.5 mbd:text-[12px] mbd:text-(--ink-2)">
            <span className="mbd:whitespace-nowrap">Min</span>
            <input
              id="filter-min-size"
              type="number"
              min="0"
              value={filters.minSize || ''}
              placeholder="0"
              onChange={(e) => update({ minSize: parseInt(e.target.value, 10) || 0 })}
              className="field num mbd:text-right"
              style={{ height: 28, width: 56 }}
            />
            <span className="eyebrow">KB</span>
          </label>

          <div className="mbd:flex mbd:items-center mbd:gap-2">
            <label htmlFor="filter-base64" className="mbd:text-[12px] mbd:text-(--ink-2)">
              Base64
            </label>
            <button
              id="filter-base64"
              type="button"
              role="switch"
              aria-checked={!base64Disabled && filters.includeBase64}
              aria-label="Include Base64 images"
              title={base64Disabled ? 'Disabled — Base64 images are excluded in Settings' : 'Include Base64 images'}
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
