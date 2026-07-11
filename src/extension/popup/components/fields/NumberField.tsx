import React from 'react';
import { NumberFieldProps } from '@/types';

/** Label + number input that clamps to [min, max] on blur. */
export const NumberField: React.FC<NumberFieldProps> = ({ id, name, label, value, min, max, onChange, onBlur }) => (
  <div>
    <label htmlFor={id} className="mbd:mb-1 mbd:block mbd:text-[12px] mbd:text-(--ink-2)">
      {label}
    </label>
    <input
      id={id}
      type="number"
      name={name}
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className="field num"
    />
  </div>
);
