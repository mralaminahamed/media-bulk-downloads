import React, { useEffect, useState } from 'react';
import {
  XMarkIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { HistoryEntry } from '@/types';
import { loadHistory, HISTORY_KEY } from '@/extension/shared/storage/history';
import { relativeTime, sendRuntimeMessage } from '../../utils';
import { LoadingImage } from '../LoadingImage';
import { useDialog } from '../../hooks/useDialog';
import { ClearAllButton } from '../fields/ClearAllButton';

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
  const panelRef = useDialog(onClose);

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

  // Mutations go through the background (single writer); update local state
  // optimistically for responsiveness — the storage.onChanged listener reconciles.
  const handleRemove = (entry: HistoryEntry) => {
    sendRuntimeMessage({ type: 'REMOVE_HISTORY_ENTRY', src: entry.src });
    setEntries((prev) => prev.filter((e) => e.src !== entry.src));
  };

  const handleClearAll = () => {
    sendRuntimeMessage({ type: 'CLEAR_HISTORY' });
    setEntries([]);
  };

  const openSource = (entry: HistoryEntry) => {
    sendRuntimeMessage({ type: 'OPEN_URL', url: entry.src });
  };

  const openFile = (entry: HistoryEntry) => {
    if (entry.downloadId === undefined) return;
    sendRuntimeMessage({ type: 'OPEN_DOWNLOAD_FILE', downloadId: entry.downloadId });
  };

  const revealFile = (entry: HistoryEntry) => {
    if (entry.downloadId === undefined) return;
    sendRuntimeMessage({ type: 'SHOW_DOWNLOAD', downloadId: entry.downloadId });
  };

  const handleRedownload = (entry: HistoryEntry) => {
    sendRuntimeMessage({
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
      explicit: true, // user picked this history item — never silently drop it via the blocklist
    });
  };

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-(--overlay) backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        tabIndex={-1}
        className="sheet-in flex h-full w-full max-w-[380px] flex-col bg-(--panel) shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 id="history-title" className="text-[13px] font-semibold text-(--ink)">Download History</h2>
            <p className="eyebrow mt-0.5">Recent downloads</p>
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
            <p className="py-8 text-center text-[12px] text-(--ink-2)">No downloads yet</p>
          ) : (
            sorted.map((entry) => (
              <div key={entry.src} className="card flex items-center gap-2.5 p-2">
                <div className="checker relative h-11 w-11 flex-none overflow-hidden rounded-sm">
                  <LoadingImage
                    src={entry.thumbnailSrc ?? entry.src}
                    alt={entry.filename}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-(--ink)">{entry.filename}</p>
                  <p className="num flex items-center gap-1 text-[11px] text-(--ink-2)">
                    <span>{relativeTime(entry.time)}</span>
                    {entry.sourcePageUrl && (
                      <>
                        <span>·</span>
                        <a
                          href={entry.sourcePageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-(--ink-2) underline"
                        >
                          {safeHost(entry.sourcePageUrl)}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-0.5">
                  <button
                    onClick={() => openSource(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Open source in new tab"
                    aria-label="Open source in new tab"
                  >
                    <ArrowTopRightOnSquareIcon className="h-[15px] w-[15px]" />
                  </button>
                  {entry.downloadId !== undefined && (
                    <>
                      <button
                        onClick={() => openFile(entry)}
                        className="iconbtn iconbtn-sm"
                        title="Open file"
                        aria-label="Open file"
                      >
                        <PhotoIcon className="h-[15px] w-[15px]" />
                      </button>
                      <button
                        onClick={() => revealFile(entry)}
                        className="iconbtn iconbtn-sm"
                        title="Show in folder"
                        aria-label="Show in folder"
                      >
                        <FolderOpenIcon className="h-[15px] w-[15px]" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleRedownload(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Re-download"
                    aria-label="Re-download"
                  >
                    <ArrowDownTrayIcon className="h-[15px] w-[15px]" />
                  </button>
                  <button
                    onClick={() => handleRemove(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Remove"
                    aria-label="Remove"
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

export default HistoryPanel;
