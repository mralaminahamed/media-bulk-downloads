import React, { useState } from 'react';
import { FilterOptions, SettingsData } from '@/types';

interface FilterToolbarProps {
  onFilterChange: (filters: FilterOptions) => void;
  extensionSettings: SettingsData;
}

const DEFAULT_FILTERS: FilterOptions = {
  imageType: 'all',
  minSize: 0,
  includeBase64: true,
  sizeBucket: 'all',
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'gif', label: 'GIF' },
  { value: 'svg', label: 'SVG' },
  { value: 'webp', label: 'WebP' },
];

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
  const isDirty =
    filters.imageType !== 'all' ||
    filters.minSize > 0 ||
    filters.sizeBucket !== 'all' ||
    (!filters.includeBase64 && !base64Disabled);

  return (
    <section className="border-b hairline bg-[var(--panel)] px-4 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Filters</span>
        {isDirty && (
          <button
            onClick={reset}
            className="text-[11px] font-medium text-[var(--brand-ink)] hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      {/* Type pills */}
      <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Image type">
        {TYPE_OPTIONS.map((opt) => (
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

      {/* Size buckets */}
      <div
        className="scroll-thin -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Image size"
      >
        {SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update({ sizeBucket: opt.value })}
            className={`chip ${filters.sizeBucket === opt.value ? 'is-active' : ''}`}
            aria-pressed={filters.sizeBucket === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Size + base64 */}
      <div className="mt-2.5 flex items-center gap-3">
        <label htmlFor="filter-min-size" className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
          <span className="whitespace-nowrap">Min size</span>
          <span className="relative">
            <input
              id="filter-min-size"
              type="number"
              min="0"
              value={filters.minSize || ''}
              placeholder="0"
              onChange={(e) => update({ minSize: parseInt(e.target.value, 10) || 0 })}
              className="field num w-[86px] pr-8 text-right"
            />
            <span className="eyebrow pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">KB</span>
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
