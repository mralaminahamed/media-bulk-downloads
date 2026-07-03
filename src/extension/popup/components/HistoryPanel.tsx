import React, { useEffect, useState } from 'react';
import { XMarkIcon, TrashIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { HistoryEntry } from '@/types';
import { loadHistory, removeEntry, clearHistory, HISTORY_KEY } from '@/extension/shared/history';
import { relativeTime } from '../utils';
import { LoadingImage } from './ImageList';

export interface HistoryPanelProps {
  onClose: () => void;
}

/** Host for display, never throwing on a malformed stored URL. */
const safeHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const HistoryPanel: React.FC<HistoryPanelProps> = ({ onClose }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    void loadHistory().then(setEntries);

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[HISTORY_KEY]) {
        void loadHistory().then(setEntries);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const sorted = [...entries].sort((a, b) => b.time - a.time);

  const handleRemove = (entry: HistoryEntry) => {
    void removeEntry(entry.src).then(() => {
      setEntries((prev) => prev.filter((e) => e.src !== entry.src));
    });
  };

  const handleClearAll = () => {
    void clearHistory().then(() => setEntries([]));
  };

  const handleRedownload = (entry: HistoryEntry) => {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_IMAGES',
      images: [
        {
          src: entry.src,
          alt: '',
          width: 0,
          height: 0,
          type: entry.type,
          fileSize: 0,
          isBase64: false,
          kind: entry.kind,
          ...(entry.thumbnailSrc ? { thumbnailSrc: entry.thumbnailSrc } : {}),
        },
      ],
      sourcePage: { url: entry.sourcePageUrl, title: entry.sourcePageTitle },
    });
  };

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-[var(--overlay)] backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="sheet-in flex h-full w-full max-w-[380px] flex-col bg-[var(--panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">Download History</h2>
            <p className="eyebrow mt-0.5">Recent downloads</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={handleClearAll} className="btn btn-ghost h-8 px-2 text-[12px]">
              Clear all
            </button>
            <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
              <XMarkIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[var(--ink-2)]">No downloads yet</p>
          ) : (
            sorted.map((entry) => (
              <div key={entry.src} className="card flex items-center gap-2.5 p-2">
                <div className="checker relative h-11 w-11 flex-none overflow-hidden rounded-[6px]">
                  <LoadingImage
                    src={entry.thumbnailSrc ?? entry.src}
                    alt={entry.filename}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[var(--ink)]">{entry.filename}</p>
                  <p className="num flex items-center gap-1 text-[11px] text-[var(--ink-2)]">
                    <span>{relativeTime(entry.time)}</span>
                    {entry.sourcePageUrl && (
                      <>
                        <span>·</span>
                        <a
                          href={entry.sourcePageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[var(--ink-2)] underline"
                        >
                          {safeHost(entry.sourcePageUrl)}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-0.5">
                  <button
                    onClick={() => handleRedownload(entry)}
                    className="iconbtn"
                    title="Re-download"
                    aria-label="Re-download"
                  >
                    <ArrowDownTrayIcon className="h-[16px] w-[16px]" />
                  </button>
                  <button
                    onClick={() => handleRemove(entry)}
                    className="iconbtn"
                    title="Remove"
                    aria-label="Remove"
                  >
                    <TrashIcon className="h-[16px] w-[16px]" />
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

export default HistoryPanel;
