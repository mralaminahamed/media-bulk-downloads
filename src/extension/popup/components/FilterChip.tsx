import React from 'react';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface FilterChipProps {
  label: string;
  active: boolean;
  onOpen: () => void;
  onClear?: () => void;
  clearLabel?: string;
  showChevron?: boolean;
  expanded?: boolean;
  controls?: string;
}

/** A filter chip: ghost when inactive, filled (`chip.is-active`) when active.
 *  The body opens something (a flyout or the More popover); an active chip also
 *  shows a separate `×` that clears just that dimension. */
const FilterChip: React.FC<FilterChipProps> = ({
  label, active, onOpen, onClear, clearLabel, showChevron, expanded, controls,
}) => (
  <span className="inline-flex items-center">
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`chip shrink-0 ${active ? 'is-active' : ''}`}
      style={{ height: 28 }}
    >
      {label}
      {showChevron && <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
    </button>
    {active && onClear && (
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        title={clearLabel}
        className="iconbtn iconbtn-sm -ml-1 shrink-0"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    )}
  </span>
);

export default FilterChip;
