import React, { useEffect, useState } from 'react';
import { XMarkIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { listOpenTabs, OpenTabInfo } from '@/extension/shared/active-tab/collect-open-tabs';
import { useDialog } from '@/extension/popup/hooks/useDialog';

export interface TabPickerPanelProps {
  onClose: () => void;
  /** Confirm with the chosen tab ids — the caller switches scope to 'selected'
   *  and rescans. Never called with an empty selection (the button is disabled). */
  onConfirm: (tabIds: number[]) => void;
  /** Tab ids ticked when the picker opens (a prior selection). */
  initialSelected?: number[];
  /** Injectable for tests; defaults to the real current-window tab list. */
  loadTabs?: () => Promise<OpenTabInfo[]>;
}

/** Host for display, never throwing on a malformed URL. */
const safeHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * "Selected tabs" picker (#283): lists the current window's eligible tabs with a
 * checkbox each, and confirms the chosen subset for a multi-tab collect.
 */
const TabPickerPanel: React.FC<TabPickerPanelProps> = ({ onClose, onConfirm, initialSelected = [], loadTabs = listOpenTabs }) => {
  const panelRef = useDialog(onClose);
  const [tabs, setTabs] = useState<OpenTabInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set(initialSelected));

  useEffect(() => {
    void loadTabs().then((list) => {
      setTabs(list);
      setSelected((prev) => new Set([...prev].filter((id) => list.some((t) => t.id === id))));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = !!tabs && tabs.length > 0 && selected.size === tabs.length;
  const toggleAll = (): void => setSelected(allSelected ? new Set() : new Set((tabs ?? []).map((t) => t.id)));

  return (
    <div className="overlay-in mbd:fixed mbd:inset-0 mbd:z-50 mbd:flex mbd:items-stretch mbd:justify-end mbd:bg-(--overlay) mbd:backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tabpicker-title"
        tabIndex={-1}
        className="sheet-in mbd:flex mbd:h-full mbd:w-full mbd:max-w-[380px] mbd:flex-col mbd:bg-(--panel) mbd:shadow-2xl mbd:focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mbd:flex mbd:items-center mbd:justify-between mbd:border-b hairline mbd:px-4 mbd:py-3">
          <div>
            <h2 id="tabpicker-title" className="mbd:text-[13px] mbd:font-semibold mbd:text-(--ink)">Select tabs to scan</h2>
            <p className="eyebrow mbd:mt-0.5">Open tabs in this window</p>
          </div>
          <div className="mbd:flex mbd:items-center mbd:gap-0.5">
            {!!tabs && tabs.length > 0 && (
              <button onClick={toggleAll} className="mbd:mr-1 mbd:text-[11px] mbd:font-semibold mbd:text-(--ink-2) mbd:hover:text-(--ink)">
                {allSelected ? 'Clear' : 'All'}
              </button>
            )}
            <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
              <XMarkIcon className="mbd:h-4.5 mbd:w-4.5" />
            </button>
          </div>
        </header>

        <div className="scroll-thin mbd:flex-1 mbd:space-y-1.5 mbd:overflow-y-auto mbd:px-4 mbd:py-4">
          {tabs === null ? (
            <p className="mbd:py-8 mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">Loading tabs…</p>
          ) : tabs.length === 0 ? (
            <p className="mbd:py-8 mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">No scannable tabs in this window</p>
          ) : (
            tabs.map((tab) => (
              <label
                key={tab.id}
                className="card mbd:flex mbd:cursor-pointer mbd:items-center mbd:gap-2.5 mbd:p-2"
              >
                <input
                  type="checkbox"
                  checked={selected.has(tab.id)}
                  onChange={() => toggle(tab.id)}
                  className="mbd:h-4 mbd:w-4 mbd:flex-none mbd:accent-(--brand)"
                  aria-label={`Scan tab: ${tab.title}`}
                />
                {tab.favIconUrl ? (
                  <img src={tab.favIconUrl} alt="" className="mbd:h-4.5 mbd:w-4.5 mbd:flex-none mbd:rounded-sm" />
                ) : (
                  <GlobeAltIcon className="mbd:h-4.5 mbd:w-4.5 mbd:flex-none mbd:text-(--ink-3)" />
                )}
                <div className="mbd:min-w-0 mbd:flex-1">
                  <p className="mbd:truncate mbd:text-[12px] mbd:font-medium mbd:text-(--ink)">{tab.title}</p>
                  <p className="num mbd:truncate mbd:text-[11px] mbd:text-(--ink-2)">{safeHost(tab.url)}</p>
                </div>
              </label>
            ))
          )}
        </div>

        <footer className="mbd:border-t hairline mbd:px-4 mbd:py-3">
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="btn btn-primary mbd:w-full mbd:disabled:opacity-40"
          >
            {selected.size === 0 ? 'Select tabs to scan' : `Scan selected (${selected.size})`}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default TabPickerPanel;
