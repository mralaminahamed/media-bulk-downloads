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

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 500 };
const hintStyle: CSSProperties = { display: 'block', marginTop: 4, fontSize: 11, color: 'var(--muted)' };

const inputStyle: CSSProperties = {
  height: 30,
  borderRadius: 6,
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0 8px',
  fontSize: 12,
};

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
  return (
    <label style={{ ...rowStyle, cursor: 'pointer' }}>
      <span style={labelRowStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'pointer' }}
          />
          <span
            aria-hidden
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: checked ? 'var(--brand)' : 'var(--line)',
              transition: 'background 150ms ease',
            }}
          >
            <span
              style={{
                display: 'block',
                width: 16,
                height: 16,
                marginTop: 2,
                marginLeft: checked ? 18 : 2,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                transition: 'margin-left 150ms ease',
              }}
            />
          </span>
        </span>
      </span>
      <Hint hint={hint} />
    </label>
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
          style={{ ...inputStyle, width: 84, textAlign: 'right' }}
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
          style={{ ...inputStyle, width: 220 }}
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
          style={{ ...inputStyle, width: 160 }}
        >
          {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <Hint hint={hint} />
    </div>
  );
}
