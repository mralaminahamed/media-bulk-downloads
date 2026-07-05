import React from 'react';
import { TextFieldProps } from '@/types';

const hintId = (id: string) => `${id}-hint`;

/** Label + text input, with an optional described hint. */
export const TextField: React.FC<TextFieldProps> = ({ id, name, label, value, onChange, placeholder, hint, hintClassName }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-[12px] text-(--ink-2)">
      {label}
    </label>
    <input
      id={id}
      type="text"
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="field"
      aria-describedby={hint ? hintId(id) : undefined}
    />
    {hint && (
      <span id={hintId(id)} className={hintClassName ?? 'mt-1 block text-[11px] text-(--ink-3)'}>
        {hint}
      </span>
    )}
  </div>
);
