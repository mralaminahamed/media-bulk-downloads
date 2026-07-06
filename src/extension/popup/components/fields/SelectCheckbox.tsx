import React from 'react';
import { SelectCheckboxProps } from '@/types';

/**
 * The selection checkbox shared by the media grid (per item) and the action
 * bar (select-all). One visual — a 20px rounded box that fills brand-ink with
 * a white check when on, or a dash when only some items are selected — so both
 * selection controls read as the same control instead of a native box beside a
 * custom one.
 */
export const SelectCheckbox: React.FC<SelectCheckboxProps> = ({
  checked,
  indeterminate = false,
  onClick,
  ariaLabel,
  title,
  className = '',
}) => {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className={`grid h-5 w-5 place-items-center rounded-[5px] border transition-all ${
        on
          ? 'border-(--brand-ink) bg-(--brand-ink) text-white'
          : 'border-(--ctl-ring) bg-(--panel)/85 text-transparent backdrop-blur-sm'
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {indeterminate ? <path d="M5 12h14" /> : <path d="M20 6 9 17l-5-5" />}
      </svg>
    </button>
  );
};
