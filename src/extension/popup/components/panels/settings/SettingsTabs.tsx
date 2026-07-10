import React, { useRef } from 'react';

export interface SettingsTab {
  id: string;
  label: string;
}

interface SettingsTabsProps {
  tabs: SettingsTab[];
  active: string;
  onSelect: (id: string) => void;
}

/** Tab-chip row for the Settings sheet. Roving-tabindex tablist; ArrowLeft/Right
 *  move selection and focus. */
export const SettingsTabs: React.FC<SettingsTabsProps> = ({ tabs, active, onSelect }) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(idx + dir + tabs.length) % tabs.length];
    onSelect(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-1.5 border-b hairline px-4 py-2.5">
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`settings-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`chip ${selected ? 'is-active' : ''}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};
