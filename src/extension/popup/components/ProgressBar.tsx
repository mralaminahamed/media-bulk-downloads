import React from 'react';

interface ProgressBarProps {
  /** Short label, e.g. "Zipping" or "Fetching videos". */
  label: string;
  /** Completed count. Ignored when `total` is 0 (indeterminate). */
  done?: number;
  /** Total count. 0 → an indeterminate (sliding) bar for work with no known size. */
  total?: number;
}

/**
 * Thin progress strip for in-extension work the browser's download shelf can't
 * show (fetching files to zip, resolving videos). Determinate when `total` > 0
 * (a filled bar + `done/total`), otherwise an indeterminate sliding bar.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({ label, done = 0, total = 0 }) => {
  const determinate = total > 0;
  const pct = determinate ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="num shrink-0 text-[11px] text-(--ink-2)">
        {label}
        {determinate ? ` ${done}/${total}` : '…'}
      </span>
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-(--panel-2)"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={determinate ? total : undefined}
        aria-valuenow={determinate ? done : undefined}
      >
        {determinate ? (
          <div className="h-full rounded-full bg-(--brand) transition-[width] duration-200" style={{ width: `${pct}%` }} />
        ) : (
          <div className="progress-indet absolute inset-0" />
        )}
      </div>
    </div>
  );
};
