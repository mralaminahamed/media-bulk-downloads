import React, { useCallback, useEffect, useRef, useState } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/Settings';
import FilterToolbar from './components/FilterToolbar';
import { AppState, DeepScanProgress, DownloadMessage, DownloadResponse, FilterOptions, ImageInfo, SettingsData } from '@/types';
import { filterImagesBySettings, applyToolbarFilters } from '../shared/filters';
import { DEFAULT_SETTINGS, withDefaults } from '../shared/settings';
import { collectFromActiveTab } from '../shared/collect-active-tab';
import { deepScanActiveTab, abortDeepScanActiveTab } from '../shared/deep-scan-active-tab';
import { getImageFileSize, mapWithConcurrency } from './utils';
import { Cog6ToothIcon, ArrowDownTrayIcon, ArrowPathIcon, ChevronDoubleDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Concurrent HEAD requests when enriching remote image sizes.
const SIZE_FETCH_CONCURRENCY = 6;

export interface AppProps {
  /** How to collect images. Defaults to messaging the active tab (popup). */
  collect?: () => Promise<ImageInfo[]>;
  /** How to run a deep scan. Defaults to messaging the active tab (popup). Hides the Deep-scan button when absent. */
  deepScan?: (onProgress: (p: DeepScanProgress) => void) => Promise<ImageInfo[]>;
  /** Aborts an in-flight deep scan. Defaults to messaging the active tab (popup). */
  abortDeepScan?: () => void;
  /** Which surface this app renders in. */
  surface?: 'popup' | 'bubble';
  /** When embedded (bubble), a close handler for the header. */
  onClose?: () => void;
  /** When embedded (bubble), wires the header as a drag handle for the panel. */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

/** Compact brand mark — the Lucide "image-down" glyph. */
const BrandMark: React.FC = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10.3" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    <circle cx="9" cy="9" r="2" />
    <path d="M19 16v6" />
    <path d="m22 19-3 3-3-3" />
  </svg>
);

const App: React.FC<AppProps> = ({
  collect = collectFromActiveTab,
  deepScan = deepScanActiveTab,
  abortDeepScan = abortDeepScanActiveTab,
  surface = 'popup',
  onClose,
  dragHandleProps,
}) => {
  const [state, setState] = useState<AppState>({
    status: '',
    images: [],
    filteredImages: [],
    isLoading: true,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [deepScanning, setDeepScanning] = useState(false);
  const [deepProgress, setDeepProgress] = useState<DeepScanProgress | null>(null);

  // All images collected from the page, before any settings/toolbar filtering.
  const rawImagesRef = useRef<ImageInfo[]>([]);
  // Generation guard so a newer refresh cancels stale size-enrichment writes.
  const enrichGenRef = useRef(0);

  useEffect(() => {
    loadSettings();
    void fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only the popup sizes the document body; the bubble is sized by its host.
    if (surface !== 'popup') return;
    document.body.style.width = `${settings.popupWidth}px`;
    document.body.style.height = `${settings.popupHeight}px`;
  }, [surface, settings.popupWidth, settings.popupHeight]);

  const loadSettings = () => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings(withDefaults(result.settings));
      }
    });
  };

  /**
   * Lazily fills in remote image byte sizes. Runs only from the popup on the
   * active tab (user-initiated), never from the background badge path.
   */
  const enrichImageSizes = useCallback(async (images: ImageInfo[]): Promise<void> => {
    const generation = ++enrichGenRef.current;
    const targets = images.filter((img) => !img.isBase64 && img.fileSize <= 0 && img.kind === 'image');

    await mapWithConcurrency(targets, SIZE_FETCH_CONCURRENCY, async (img) => {
      const size = await getImageFileSize(img.src);
      if (generation !== enrichGenRef.current || size <= 0) return;

      const apply = (list: ImageInfo[]) =>
        list.map((i) => (i.src === img.src ? { ...i, fileSize: size } : i));

      setState((prev) => ({
        ...prev,
        images: apply(prev.images),
        filteredImages: apply(prev.filteredImages),
      }));
    });
  }, []);

  const fetchImages = useCallback(async (): Promise<void> => {
    enrichGenRef.current++; // cancel any in-flight enrichment
    setState((prev) => ({ ...prev, isLoading: true, status: '' }));

    try {
      const imageList = await collect();
      const raw = Array.isArray(imageList) ? imageList : [];
      rawImagesRef.current = raw;
      const eligible = filterImagesBySettings(raw, settings);

      setState((prev) => ({
        ...prev,
        images: eligible,
        filteredImages: eligible,
        status: '',
        isLoading: false,
      }));

      void enrichImageSizes(eligible);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      setState((prev) => ({
        ...prev,
        status: `Can't read this page: ${message}`,
        isLoading: false,
      }));
    }
  }, [collect, settings, enrichImageSizes]);

  // Re-derive the eligible base list when the settings that affect it change.
  useEffect(() => {
    if (rawImagesRef.current.length === 0) return;
    const eligible = filterImagesBySettings(rawImagesRef.current, settings);
    setState((prev) => ({ ...prev, images: eligible, filteredImages: eligible }));
    void enrichImageSizes(eligible);
    // Intentionally keyed on the two settings fields that affect eligibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.minimumImageSize, settings.excludeBase64Images, enrichImageSizes]);

  const handleDeepScan = async () => {
    if (deepScanning) {
      abortDeepScan();
      return;
    }
    setDeepScanning(true);
    setDeepProgress(null);
    try {
      const found = await deepScan(setDeepProgress);
      const bySrc = new Map(state.images.map((m) => [m.src, m]));
      found.forEach((m) => {
        if (!bySrc.has(m.src)) bySrc.set(m.src, m);
      });
      const merged = [...bySrc.values()];
      rawImagesRef.current = merged;
      const eligible = filterImagesBySettings(merged, settings);
      setState((prev) => ({ ...prev, images: eligible, filteredImages: eligible }));
      void enrichImageSizes(eligible);
    } catch (e) {
      setState((prev) => ({ ...prev, status: e instanceof Error ? e.message : 'deep scan failed' }));
    } finally {
      setDeepScanning(false);
    }
  };

  const handleFilterChange = (filters: FilterOptions) => {
    const filteredImages = applyToolbarFilters(state.images, filters);
    setState((prev) => ({ ...prev, filteredImages, status: '' }));
  };

  const handleDownload = (images: ImageInfo | ImageInfo[]): void => {
    const imagesToDownload = Array.isArray(images) ? images : [images];
    setState((prev) => ({
      ...prev,
      status: `Sending ${imagesToDownload.length} file${imagesToDownload.length === 1 ? '' : 's'} to downloads…`,
    }));

    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: imagesToDownload };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      // chrome.runtime.lastError is only valid during this callback — capture it
      // now, not later inside the (deferred) setState updater.
      const error = chrome.runtime.lastError;
      const status = error ? `Error: ${error.message || 'unknown error'}` : response.message;
      setState((prev) => ({ ...prev, status }));
    });
  };

  const handleBulkDownload = (): void => {
    const imagesToDownload = state.filteredImages.length > 0 ? state.filteredImages : state.images;
    handleDownload(imagesToDownload);
  };

  const handleSingleImageDownload = (image: ImageInfo): void => handleDownload(image);

  // Single source of truth for persistence: the popup owns writing settings.
  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    chrome.storage.sync.set({ settings: newSettings });
  };

  const total = state.images.length;
  const shown = state.filteredImages.length;
  const hasImages = total > 0;
  const filtered = shown !== total;

  return (
    <div className="ibd-app flex h-full flex-col overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* Header (doubles as the panel drag handle in the bubble surface) */}
      <header className="dotgrid border-b hairline" {...dragHandleProps}>
        <div className="flex items-center justify-between px-4 pt-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[8px] border hairline bg-[var(--panel)]">
              <BrandMark />
            </span>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">Media Bulk Downloads</h1>
              <p className="eyebrow mt-1">Collect · Filter · Save</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setShowSettings(true)} className="iconbtn" title="Settings" aria-label="Settings">
              <Cog6ToothIcon className="h-[18px] w-[18px]" />
            </button>
            {onClose && (
              <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
                <XMarkIcon className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between px-4 pb-3.5 pt-3">
          <div className="flex items-baseline gap-2">
            <span className="num text-[30px] font-semibold leading-none text-[var(--ink)]">
              {state.isLoading ? '—' : total}
            </span>
            <span className="text-[12px] text-[var(--ink-2)]">
              {state.isLoading ? 'scanning this page' : total === 1 ? 'item on this page' : 'items on this page'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {deepScanning && (
              <span className="num text-[11px] text-[var(--ink-2)]">scanning… {deepProgress?.found ?? 0} found</span>
            )}
            <button
              onClick={handleDeepScan}
              className="iconbtn"
              title={deepScanning ? 'Stop deep scan' : 'Deep scan (scroll to load more)'}
              aria-label={deepScanning ? 'Stop deep scan' : 'Deep scan'}
            >
              <ChevronDoubleDownIcon
                className={`h-[17px] w-[17px] ${deepScanning ? 'animate-pulse' : ''}`}
              />
            </button>
            <button onClick={fetchImages} className="iconbtn" title="Rescan page" aria-label="Rescan page">
              <ArrowPathIcon className={`h-[17px] w-[17px] ${state.isLoading ? 'animate-[spin_0.9s_linear_infinite]' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      {hasImages && !state.isLoading && (
        <FilterToolbar onFilterChange={handleFilterChange} extensionSettings={settings} />
      )}

      {/* Body */}
      <main className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
        {state.isLoading ? (
          <SkeletonGrid thumbnailSize={settings.thumbnailSize} />
        ) : total === 0 ? (
          <EmptyState message={state.status} onRefresh={fetchImages} />
        ) : (
          <ImageList
            images={state.filteredImages}
            onImageDownload={handleSingleImageDownload}
            thumbnailSize={settings.thumbnailSize}
            previewSize={settings.previewSize}
          />
        )}
      </main>

      {/* Action bar */}
      {hasImages && !state.isLoading && (
        <footer className="flex items-center justify-between gap-3 border-t hairline bg-[var(--panel)] px-4 py-2.5">
          <p className="num min-w-0 flex-1 truncate text-[11px] text-[var(--ink-2)]">
            {state.status ? (
              state.status
            ) : (
              <>
                <span className="text-[var(--ink)]">{shown}</span>
                <span className="text-[var(--ink-3)]"> / {total}</span>
                {filtered && <span className="text-[var(--ink-3)]"> shown</span>}
              </>
            )}
          </p>
          <button onClick={handleBulkDownload} disabled={shown === 0} className="btn btn-primary flex-none">
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span>Download{shown > 0 ? ` ${shown}` : ''}</span>
          </button>
        </footer>
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} onSettingsChange={handleSettingsChange} settings={settings} />
      )}
    </div>
  );
};

/**
 * Scanning state — a skeleton grid that mirrors the real thumbnail layout, so
 * the switch to loaded images doesn't shift the page. A small "Scanning" hint
 * keeps the branded scanning language.
 */
const SkeletonGrid: React.FC<{ thumbnailSize: number }> = ({ thumbnailSize }) => (
  <div className="reveal">
    <p className="eyebrow mb-2.5 text-center">Scanning page…</p>
    <div
      className="grid justify-center gap-2.5"
      style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-[var(--radius)] border hairline bg-[var(--panel)]">
          <div className="skeleton aspect-square" />
          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
            <span className="skeleton h-2.5 w-10 rounded-[3px]" />
            <span className="skeleton h-2.5 w-7 rounded-[3px]" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const EmptyState: React.FC<{ message: string; onRefresh: () => void }> = ({ message, onRefresh }) => (
  <div className="reveal grid h-full place-items-center text-center">
    <div className="flex max-w-[260px] flex-col items-center gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-[12px] border hairline bg-[var(--panel)] text-[var(--ink-3)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </span>
      <div>
        <p className="text-[13px] font-semibold text-[var(--ink)]">No media here</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-2)]">
          {message || 'This page has no media that matches your filters. Try another page or rescan.'}
        </p>
      </div>
      <button onClick={onRefresh} className="btn btn-ghost h-9">
        <ArrowPathIcon className="h-4 w-4" />
        <span>Rescan page</span>
      </button>
    </div>
  </div>
);

export default App;
