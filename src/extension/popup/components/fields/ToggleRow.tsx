import React from 'react';
import { ToggleRowProps } from '@/types';

export const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onToggle }) => (
  <div className="mbd:py-1.5">
    <div className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-3">
      <label htmlFor={id} className="mbd:text-[13px] mbd:text-(--ink)">
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
      <p id={`${id}-desc`} className="mbd:mt-1 mbd:pr-12 mbd:text-[11px] mbd:leading-relaxed mbd:text-(--ink-3)">
        {description}
      </p>
    )}
  </div>
);
