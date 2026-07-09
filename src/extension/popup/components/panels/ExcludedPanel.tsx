import React, { useEffect, useState } from 'react';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ExcludedEntry } from '@/types';
import { loadExcluded, EXCLUDED_KEY } from '@/extension/shared/storage/excluded';
import { sendRuntimeMessage } from '../../utils';
import { useDialog } from '../../hooks/useDialog';
import { ClearAllButton } from '../fields/ClearAllButton';

export interface ExcludedPanelProps {
  onClose: () => void;
}

/** A readable label for an excluded URL: its basename, else its host, else the raw src. */
const displayName = (src: string): string => {
  try {
    const { protocol, pathname, host } = new URL(src);
    // A data: URL has no basename — its "path" is the whole base64 payload, which
    // would render as a giant unreadable label. Show a short kind instead.
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

  // Mutations go through the background (single writer); update local state
  // optimistically — the storage.onChanged listener reconciles.
  const handleRemove = (entry: ExcludedEntry) => {
    sendRuntimeMessage({ type: 'REMOVE_EXCLUDED', kind: entry.kind, value: entry.value });
    setEntries((prev) => prev.filter((e) => !(e.kind === entry.kind && e.value === entry.value)));
  };

  const handleClearAll = () => {
    sendRuntimeMessage({ type: 'CLEAR_EXCLUDED' });
    setEntries([]);
  };

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-(--overlay) backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="excluded-title"
        tabIndex={-1}
        className="sheet-in flex h-full w-full max-w-[380px] flex-col bg-(--panel) shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 id="excluded-title" className="text-[13px] font-semibold text-(--ink)">Excluded sources</h2>
            <p className="eyebrow mt-0.5">Blocklist</p>
          </div>
          <div className="flex items-center gap-0.5">
            <ClearAllButton onClear={handleClearAll} disabled={sorted.length === 0} />
            <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
              <XMarkIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-(--ink-2)">No excluded sources.</p>
          ) : (
            sorted.map((entry) => (
              <div key={`${entry.kind} ${entry.value}`} className="card flex items-center gap-2.5 p-2">
                <span className="eyebrow flex-none rounded-sm border hairline px-1.5 py-0.5 text-[10px] uppercase">
                  {entry.kind === 'url' ? 'URL' : 'Host'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-(--ink)">
                    {entry.kind === 'url' ? displayName(entry.value) : entry.value}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-0.5">
                  <button
                    onClick={() => handleRemove(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Remove"
                    aria-label={`Remove ${entry.value}`}
                  >
                    <TrashIcon className="h-[15px] w-[15px]" />
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
