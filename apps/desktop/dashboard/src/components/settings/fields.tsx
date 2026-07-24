import { useId } from 'react';
import type { CSSProperties } from 'react';

const rowStyle: CSSProperties = {
  display: 'block',
  padding: '10px 0',
  borderBottom: '1px solid var(--line)',
};

const labelRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--ink)' };
const hintStyle: CSSProperties = { display: 'block', marginTop: 4, fontSize: 11, color: 'var(--ink-3)' };

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}

function Hint({ hint }: { hint?: string }) {
  return hint ? <span style={hintStyle}>{hint}</span> : null;
}

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}

export function ToggleRow({ label, checked, onChange, hint }: ToggleRowProps) {
  const id = useId();
  return (
    <div style={rowStyle}>
      <div style={labelRowStyle}>
        <label htmlFor={id} style={labelStyle}>{label}</label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          title={label}
          onClick={() => onChange(!checked)}
          className="switch"
        />
      </div>
      <Hint hint={hint} />
    </div>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}

export function NumberField({ label, value, onChange, min, max, hint }: NumberFieldProps) {
  return (
    <div style={rowStyle}>
      <div style={labelRowStyle}>
        <span style={labelStyle}>{label}</span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isNaN(n)) return;
            onChange(clamp(n, min, max));
          }}
          className="field num"
          style={{ width: 84, textAlign: 'right' }}
        />
      </div>
      <Hint hint={hint} />
    </div>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}

export function TextField({ label, value, onChange, placeholder, hint }: TextFieldProps) {
  return (
    <div style={rowStyle}>
      <div style={labelRowStyle}>
        <span style={labelStyle}>{label}</span>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="field"
          style={{ width: 220 }}
        />
      </div>
      <Hint hint={hint} />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  hint?: string;
}

export function SelectField({ label, value, options, onChange, hint }: SelectFieldProps) {
  return (
    <div style={rowStyle}>
      <div style={labelRowStyle}>
        <span style={labelStyle}>{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field"
          style={{ width: 160 }}
        >
          {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <Hint hint={hint} />
    </div>
  );
}
