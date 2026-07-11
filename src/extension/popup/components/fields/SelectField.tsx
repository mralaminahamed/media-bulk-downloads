import React from 'react';
import { SelectFieldProps } from '@/types';

/** Label + native select. */
export const SelectField: React.FC<SelectFieldProps> = ({ id, name, label, value, onChange, children }) => (
  <div>
    <label htmlFor={id} className="mbd:mb-1 mbd:block mbd:text-[12px] mbd:text-(--ink-2)">
      {label}
    </label>
    <select id={id} name={name} value={value} onChange={onChange} className="field">
      {children}
    </select>
  </div>
);
