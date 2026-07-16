import React, { useEffect, useState } from 'react';
import {
  XMarkIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { HistoryEntry } from '@mbd/core/types';
import { loadHistory, HISTORY_KEY } from '@mbd/storage/history';
import { relativeTime, sendRuntimeMessage } from '@/extension/popup/utils';
import { LoadingImage } from '@/extension/popup/components/LoadingImage';
import { useDialog } from '@/extension/popup/hooks/useDialog';
import { ClearAllButton } from '@/extension/popup/components/fields/ClearAllButton';

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
    <div className="overlay-in mbd:fixed mbd:inset-0 mbd:z-50 mbd:flex mbd:items-stretch mbd:justify-end mbd:bg-(--overlay) mbd:backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        tabIndex={-1}
        className="drawer-in mbd:flex mbd:h-full mbd:w-full mbd:max-w-[380px] mbd:flex-col mbd:bg-(--panel) mbd:shadow-2xl mbd:focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mbd:flex mbd:items-center mbd:justify-between mbd:border-b hairline mbd:px-4 mbd:py-3">
          <div>
            <h2 id="history-title" className="mbd:text-[13px] mbd:font-semibold mbd:text-(--ink)">Download History</h2>
            <p className="eyebrow mbd:mt-0.5">Recent downloads</p>
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
            <p className="mbd:py-8 mbd:text-center mbd:text-[12px] mbd:text-(--ink-2)">No downloads yet</p>
          ) : (
            sorted.map((entry) => (
              <div key={entry.src} className="card mbd:flex mbd:items-center mbd:gap-2.5 mbd:p-2">
                <div className="checker mbd:relative mbd:h-11 mbd:w-11 mbd:flex-none mbd:overflow-hidden mbd:rounded-sm">
                  <LoadingImage
                    src={entry.thumbnailSrc ?? entry.src}
                    alt={entry.filename}
                    className="mbd:h-full mbd:w-full mbd:object-cover"
                  />
                </div>
                <div className="mbd:min-w-0 mbd:flex-1">
                  <p className="mbd:truncate mbd:text-[12px] mbd:font-medium mbd:text-(--ink)">{entry.filename}</p>
                  <p className="num mbd:flex mbd:items-center mbd:gap-1 mbd:text-[11px] mbd:text-(--ink-2)">
                    <span>{relativeTime(entry.time)}</span>
                    {entry.sourcePageUrl && (
                      <>
                        <span>·</span>
                        <a
                          href={entry.sourcePageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mbd:truncate mbd:text-(--ink-2) mbd:underline"
                        >
                          {safeHost(entry.sourcePageUrl)}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="mbd:flex mbd:flex-none mbd:items-center mbd:gap-0.5">
                  <button
                    onClick={() => openSource(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Open source in new tab"
                    aria-label="Open source in new tab"
                  >
                    <ArrowTopRightOnSquareIcon className="mbd:h-[15px] mbd:w-[15px]" />
                  </button>
                  {entry.downloadId !== undefined && (
                    <>
                      <button
                        onClick={() => openFile(entry)}
                        className="iconbtn iconbtn-sm"
                        title="Open file"
                        aria-label="Open file"
                      >
                        <PhotoIcon className="mbd:h-[15px] mbd:w-[15px]" />
                      </button>
                      <button
                        onClick={() => revealFile(entry)}
                        className="iconbtn iconbtn-sm"
                        title="Show in folder"
                        aria-label="Show in folder"
                      >
                        <FolderOpenIcon className="mbd:h-[15px] mbd:w-[15px]" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleRedownload(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Re-download"
                    aria-label="Re-download"
                  >
                    <ArrowDownTrayIcon className="mbd:h-[15px] mbd:w-[15px]" />
                  </button>
                  <button
                    onClick={() => handleRemove(entry)}
                    className="iconbtn iconbtn-sm"
                    title="Remove"
                    aria-label="Remove"
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

export default HistoryPanel;
