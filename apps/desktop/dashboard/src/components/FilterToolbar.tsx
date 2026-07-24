import type { AvailableOptions, FilterOptions, SortKey } from '@mbd/core/types';
import { FORMAT_LABELS } from '@mbd/core/collection/filters';
import { DEFAULT_FILTERS } from '../lib/filters.ts';

export interface FilterToolbarProps {
  filters: FilterOptions;
  available: AvailableOptions;
  onChange: (patch: Partial<FilterOptions>) => void;
}

const KIND_LABELS: Record<FilterOptions['mediaKind'], string> = {
  all: 'All kinds',
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
};

const SIZE_LABELS: Record<'all' | 'small' | 'medium' | 'large', string> = {
  all: 'Any size',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: 'Sort: Default' },
  { value: 'name', label: 'Sort: Name' },
  { value: 'size', label: 'Sort: Size' },
  { value: 'dimensions', label: 'Sort: Dimensions' },
  { value: 'type', label: 'Sort: Type' },
];

export function FilterToolbar({ filters, available, onChange }: FilterToolbarProps) {
  const formatFamily: 'image' | 'video' | 'audio' = filters.mediaKind === 'all' ? 'image' : filters.mediaKind;
  const formatOptions = available.formats[formatFamily];
  const showFormat = formatOptions.length > 1;
  const showSize = filters.mediaKind === 'all' || filters.mediaKind === 'image';

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '10px 16px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <label style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search media…"
          aria-label="Search media"
          title="Search media"
          className="field"
          style={{ width: '100%' }}
        />
      </label>

      <select
        aria-label="Media kind"
        title="Media kind"
        value={filters.mediaKind}
        onChange={(e) => onChange({ mediaKind: e.target.value as FilterOptions['mediaKind'], imageType: 'all' })}
        className="field"
        style={{ height: 30, width: 130 }}
      >
        {available.kinds.map((k) => (
          <option key={k} value={k}>{KIND_LABELS[k]}</option>
        ))}
      </select>

      {showFormat && (
        <select
          aria-label="Media format"
          title="Media format"
          value={filters.imageType}
          onChange={(e) => onChange({ imageType: e.target.value })}
          className="field"
          style={{ height: 30, width: 130 }}
        >
          {formatOptions.map((f) => (
            <option key={f} value={f}>{f === 'all' ? 'All formats' : (FORMAT_LABELS[f] ?? f.toUpperCase())}</option>
          ))}
        </select>
      )}

      {showSize && (
        <select
          aria-label="Size"
          title="Size"
          value={filters.sizeBucket}
          onChange={(e) => onChange({ sizeBucket: e.target.value as FilterOptions['sizeBucket'] })}
          className="field"
          style={{ height: 30, width: 110 }}
        >
          {available.sizeBuckets.map((b) => (
            <option key={b} value={b}>{SIZE_LABELS[b]}</option>
          ))}
        </select>
      )}

      <label
        htmlFor="filter-min-size"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}
      >
        Min KB
        <input
          id="filter-min-size"
          type="number"
          min={0}
          value={filters.minSize || ''}
          placeholder="0"
          onChange={(e) => onChange({ minSize: parseInt(e.target.value, 10) || 0 })}
          className="field num"
          style={{ height: 30, width: 64, textAlign: 'right' }}
        />
      </label>

      <select
        aria-label="Sort order"
        title="Sort order"
        value={filters.sortBy}
        onChange={(e) => onChange({ sortBy: e.target.value as SortKey })}
        className="field"
        style={{ height: 30, width: 150 }}
      >
        {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>

      <button
        type="button"
        onClick={() => onChange({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
        disabled={filters.sortBy === 'default'}
        title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
        aria-label={`Sort direction: ${filters.sortDir === 'asc' ? 'ascending' : 'descending'}`}
        className="iconbtn iconbtn-sm"
      >
        {filters.sortDir === 'asc' ? '↑' : '↓'}
      </button>

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="btn btn-sm btn-ghost"
          style={{ marginLeft: 'auto' }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
