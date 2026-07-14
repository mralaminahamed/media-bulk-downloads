import React, { useEffect, useRef, useState } from 'react';
import FilterChip from '@/extension/popup/components/FilterChip';

interface ChipFlyoutOption<T extends string> { value: T; label: string }
interface ChipFlyoutProps<T extends string> {
  id: string;
  triggerLabel: string;
  valueLabel: (v: T) => string;
  options: ChipFlyoutOption<T>[];
  value: T;
  defaultValue: T;
  onChange: (v: T) => void;
  clearLabel: string;
}

/** A chip that opens a single-select menu. Active when value !== defaultValue.
 *  Outside-click uses composedPath (renders inside a shadow root); Escape closes. */
function ChipFlyout<T extends string>({
  id, triggerLabel, valueLabel, options, value, defaultValue, onChange, clearLabel,
}: ChipFlyoutProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== defaultValue;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !e.composedPath().includes(ref.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={ref} className="mbd:relative mbd:inline-flex">
      <FilterChip
        label={active ? valueLabel(value) : triggerLabel}
        active={active}
        onOpen={() => setOpen((o) => !o)}
        onClear={active ? () => onChange(defaultValue) : undefined}
        clearLabel={clearLabel}
        showChevron
        expanded={open}
        controls={id}
      />
      {open && (
        <div
          id={id}
          role="menu"
          className="mbd:absolute mbd:top-full mbd:left-0 mbd:z-10 mbd:mt-1.5 mbd:w-44 mbd:overflow-hidden mbd:rounded-(--radius-sm) mbd:border hairline mbd:bg-(--panel) mbd:py-1 mbd:shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              onClick={() => choose(opt.value)}
              className={`mbd:flex mbd:w-full mbd:items-center mbd:px-3 mbd:py-1.5 mbd:text-left mbd:text-[12px] mbd:hover:bg-(--panel-2) ${
                opt.value === value ? 'mbd:text-(--ink) mbd:font-semibold' : 'mbd:text-(--ink-2)'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChipFlyout;
