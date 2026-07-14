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
  <span className="mbd:inline-flex mbd:items-center">
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`chip mbd:shrink-0 ${active ? 'is-active' : ''}`}
      style={{ height: 28 }}
    >
      {label}
      {showChevron && <ChevronDownIcon className={`mbd:h-3.5 mbd:w-3.5 mbd:transition-transform ${expanded ? 'mbd:rotate-180' : ''}`} />}
    </button>
    {active && onClear && (
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        title={clearLabel}
        className="iconbtn iconbtn-sm mbd:-ml-1 mbd:shrink-0"
      >
        <XMarkIcon className="mbd:h-3.5 mbd:w-3.5" />
      </button>
    )}
  </span>
);

export default FilterChip;
