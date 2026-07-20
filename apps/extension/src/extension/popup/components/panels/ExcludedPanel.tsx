import React, { useEffect, useState } from 'react';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ExcludedEntry } from '@mbd/core/types';
import { loadExcluded, EXCLUDED_KEY } from '@mbd/storage/excluded';
import { sendRuntimeMessage } from '@/extension/popup/utils';
import { useDialog } from '@/extension/popup/hooks/useDialog';
import { ClearAllButton } from '@/extension/popup/components/fields/ClearAllButton';

export interface ExcludedPanelProps {
  onClose: () => void;
}

/** A readable label for an excluded URL: its basename, else its host, else the raw src. */
const displayName = (src: string): string => {
  try {
    const { protocol, pathname, host } = new URL(src);
    if (protocol === 'data:') return 'Embedded image';
    const base = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    return base || host || src;
  } catch {
    return src;
  }
};

const ExcludedPanel: React.FC<ExcludedPanelProps> = ({ onClose }) => {
  const [entries, setEntries] = useState<ExcludedEntry[]>([]);
  const panelRef = useDialog(onClose);

  useEffect(() => {
    void loadExcluded().then(setEntries);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[EXCLUDED_KEY]) {
        void loadExcluded().then(setEntries);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const sorted = [...entries].sort((a, b) => b.time - a.time);

  const handleRemove = (entry: ExcludedEntry) => {
    sendRuntimeMessage({ type: 'REMOVE_EXCLUDED', kind: entry.kind, value: entry.value });
    setEntries((prev) => prev.filter((e) => !(e.kind === entry.kind && e.value === entry.value)));
  };

  const handleClearAll = () => {
    sendRuntimeMessage({ type: 'CLEAR_EXCLUDED' });
    setEntries([]);
  };

  return (
    <div className="overlay-in mbd:fixed mbd:inset-0 mbd:z-50 mbd:flex mbd:items-stretch mbd:justify-end mbd:bg-(--overlay) mbd:backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="excluded-title"
        tabIndex={-1}
        className="sheet-in mbd:flex mbd:h-full mbd:w-full mbd:max-w-[380px] mbd:flex-col mbd:bg-(--panel) mbd:shadow-2xl mbd:focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mbd:flex mbd:items-center mbd:justify-between mbd:border-b hairline mbd:px-4 mbd:py-3">
          <div>
            <h2 id="excluded-title" className="mbd:text-[13px] mbd:font-semibold mbd:text-(--ink)">Excluded sources</h2>
            <p className="eyebrow mbd:mt-0.5">Blocklist</p>
          </div>
          <div className="mbd:flex mbd:items-center mbd:gap-0.5">
            <ClearAllButton onClear={handleClearAll} disabled={sorted.length === 0} />
            <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
              <XMarkIcon className="mbd:h-4.5 mbd:w-4.5" />
            </button>
          </div>
        </header>

        <div className="scroll-thin mbd:flex-1 mbd:space-y-2 mbd:overflow-y-auto mbd:px-4 mbd:py-4">
          {sorted.length === 0 ? (
            <p className="mbd:py-8 mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">No excluded sources.</p>
          ) : (
            sorted.map((entry) => (
              <div key={`${entry.kind} ${entry.value}`} className="card mbd:flex mbd:items-center mbd:gap-2.5 mbd:p-2">
                <span className="eyebrow mbd:flex-none mbd:rounded-sm mbd:border hairline mbd:px-1.5 mbd:py-0.5 mbd:text-[10px] mbd:uppercase">
                  {entry.kind === 'url' ? 'URL' : 'Host'}
                </span>
                <div className="mbd:min-w-0 mbd:flex-1">
                  <p className="mbd:truncate mbd:text-[12px] mbd:font-medium mbd:text-(--ink)">
                    {entry.kind === 'url' ? displayName(entry.value) : entry.value}
                  </p>
                </div>
                <div className="mbd:flex mbd:flex-none mbd:items-center mbd:gap-0.5">
                  <button
                    onClick={() => handleRemove(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Remove"
                    aria-label={`Remove ${entry.value}`}
                  >
                    <TrashIcon className="mbd:h-[15px] mbd:w-[15px]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ExcludedPanel;
