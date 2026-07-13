import React from 'react';
import { SelectCheckboxProps } from '@mbd/core/types';

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
      className={`mbd:grid mbd:h-5 mbd:w-5 mbd:place-items-center mbd:rounded-[5px] mbd:border mbd:transition-all ${
        on
          ? 'mbd:border-(--brand-ink) mbd:bg-(--brand-ink) mbd:text-white'
          : 'mbd:border-(--ctl-ring) mbd:bg-(--panel)/85 mbd:text-transparent mbd:backdrop-blur-sm'
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="mbd:h-3 mbd:w-3"
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
