import React from 'react';
import { SelectFieldProps } from '@/types';

/** Label + native select. */
export const SelectField: React.FC<SelectFieldProps> = ({ id, name, label, value, onChange, children }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-[12px] text-(--ink-2)">
      {label}
    </label>
    <select id={id} name={name} value={value} onChange={onChange} className="field">
      {children}
    </select>
  </div>
);
