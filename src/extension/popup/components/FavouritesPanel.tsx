import React, { useEffect, useState } from 'react';
import {
  XMarkIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { FavouriteEntry } from '@/types';
import { loadFavourites, FAVOURITES_KEY } from '@/extension/shared/storage/favourites';
import { relativeTime } from '../utils';
import { LoadingImage } from './LoadingImage';
import { useDialog } from '../hooks/useDialog';

export interface FavouritesPanelProps {
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

/** A readable label for a favourite: the URL's basename, else its host, else the raw src. */
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

const FavouritesPanel: React.FC<FavouritesPanelProps> = ({ onClose }) => {
  const [entries, setEntries] = useState<FavouriteEntry[]>([]);
  const panelRef = useDialog(onClose);

  useEffect(() => {
    void loadFavourites().then(setEntries);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[FAVOURITES_KEY]) {
        void loadFavourites().then(setEntries);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const sorted = [...entries].sort((a, b) => b.time - a.time);

  // Mutations go through the background (single writer); update local state
  // optimistically — the storage.onChanged listener reconciles.
  const handleRemove = (entry: FavouriteEntry) => {
    chrome.runtime.sendMessage({ type: 'REMOVE_FAVOURITE', src: entry.src });
    setEntries((prev) => prev.filter((e) => e.src !== entry.src));
  };

  const handleClearAll = () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_FAVOURITES' });
    setEntries([]);
  };

  const openSource = (entry: FavouriteEntry) => {
    chrome.runtime.sendMessage({ type: 'OPEN_URL', url: entry.sourcePageUrl || entry.src });
  };

  const handleDownload = (entry: FavouriteEntry) => {
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
    <div className="overlay-in fixed inset-0 z-50 flex items-stretch justify-end bg-(--overlay) backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="favourites-title"
        tabIndex={-1}
        className="sheet-in flex h-full w-full max-w-[380px] flex-col bg-(--panel) shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b hairline px-4 py-3">
          <div>
            <h2 id="favourites-title" className="text-[13px] font-semibold text-(--ink)">Favourites</h2>
            <p className="eyebrow mt-0.5">Saved media</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={handleClearAll} className="btn btn-sm btn-ghost">
              Clear all
            </button>
            <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
              <XMarkIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-(--ink-2)">No favourites yet</p>
          ) : (
            sorted.map((entry) => (
              <div key={entry.src} className="card flex items-center gap-2.5 p-2">
                <div className="checker relative h-11 w-11 flex-none overflow-hidden rounded-sm">
                  <LoadingImage
                    src={entry.thumbnailSrc ?? entry.src}
                    alt={displayName(entry.src)}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-(--ink)">{displayName(entry.src)}</p>
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
                  <button onClick={() => openSource(entry)} className="iconbtn iconbtn-sm" title="Open source in new tab" aria-label="Open source in new tab">
                    <ArrowTopRightOnSquareIcon className="h-[15px] w-[15px]" />
                  </button>
                  <button onClick={() => handleDownload(entry)} className="iconbtn iconbtn-sm" title="Download" aria-label="Download">
                    <ArrowDownTrayIcon className="h-[15px] w-[15px]" />
                  </button>
                  <button onClick={() => handleRemove(entry)} className="iconbtn iconbtn-sm" title="Remove" aria-label="Remove">
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

export default FavouritesPanel;
