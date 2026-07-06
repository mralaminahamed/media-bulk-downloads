import React from 'react';
import { ToggleRowProps } from '@/types';

export const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onToggle }) => (
  <div className="py-1.5">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[13px] text-(--ink)">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={label}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={onToggle}
        className="switch"
      />
    </div>
    {description && (
      <p id={`${id}-desc`} className="mt-1 pr-12 text-[11px] leading-relaxed text-(--ink-3)">
        {description}
      </p>
    )}
  </div>
);
