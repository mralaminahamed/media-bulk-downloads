import React, { useCallback, useEffect, useRef, useState } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/Settings';
import HistoryPanel from './components/HistoryPanel';
import FavouritesPanel from './components/FavouritesPanel';
import FilterToolbar, { DEFAULT_FILTERS } from './components/FilterToolbar';
import { BrandMark } from '../components/BrandMark';
import { SkeletonGrid } from './components/states/SkeletonGrid';
import { EmptyState } from './components/states/EmptyState';
import { ErrorState } from './components/states/ErrorState';
import { AppState, AppProps, DeepScanProgress, DeepScanStopReason, DownloadMessage, DownloadResponse, FavouriteEntry, FilterOptions, ImageInfo, SettingsData } from '@/types';
import { filterImagesBySettings, applyToolbarFilters } from '../shared/filters';
import { DEFAULT_SETTINGS, withDefaults } from '../shared/settings';
import { collectFromActiveTab } from '../shared/collect-active-tab';
import { deepScanActiveTab, abortDeepScanActiveTab } from '../shared/deep-scan-active-tab';
import { requestResolveOriginals } from '../shared/resolve-originals-active';
import { downloadedSrcSet, HISTORY_KEY } from '../shared/history';
import { favouriteSrcSet, FAVOURITES_KEY } from '../shared/favourites';
import { getImageFileSize, mapWithConcurrency } from './utils';
import { Cog6ToothIcon, ArrowDownTrayIcon, ArrowPathIcon, ChevronDoubleDownIcon, ClockIcon, XMarkIcon, StarIcon, VideoCameraIcon } from '@heroicons/react/24/outline';

// Concurrent HEAD requests when enriching remote image sizes.
const SIZE_FETCH_CONCURRENCY = 6;

/**
 * A user-facing note when a deep scan stopped at one of its caps rather than
 * running dry — so the user knows more media may exist below. Natural completion
 * and user-aborted scans return null (no note).
 */
function deepScanCapMessage(reason: DeepScanStopReason | undefined, count: number): string | null {
  switch (reason) {
    case 'max-items': return `Stopped at the ${count}-item limit — some media may remain.`;
    case 'max-time': return 'Stopped at the time limit — some media may remain.';
    case 'max-scrolls': return 'Stopped at the scroll limit — some media may remain.';
    default: return null;
  }
}

/** Items the user can actually download now — pending videos are excluded until resolved. */
const downloadable = (list: ImageInfo[]): ImageInfo[] => list.filter((i) => !i.unresolvedVideo);

/** Pending videos that still carry a resolve hint — the set "Get all videos" acts on. */
const pendingVideos = (list: ImageInfo[]): ImageInfo[] =>
  list.filter((i) => i.kind === 'video' && i.unresolvedVideo && !!i.resolveHint);

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
  const [showHistory, setShowHistory] = useState(false);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [deepScanning, setDeepScanning] = useState(false);
  const [deepProgress, setDeepProgress] = useState<DeepScanProgress | null>(null);
  const [downloadedSrcs, setDownloadedSrcs] = useState<Set<string>>(new Set());
  const [showFavourites, setShowFavourites] = useState(false);
  const [favouriteSrcs, setFavouriteSrcs] = useState<Set<string>>(new Set());
  const [resolveFailedSrcs, setResolveFailedSrcs] = useState<Set<string>>(new Set());
  const [fetchingSrcs, setFetchingSrcs] = useState<Set<string>>(new Set());

  // All images collected from the page, before any settings/toolbar filtering.
  const rawImagesRef = useRef<ImageInfo[]>([]);
  // Generation guard so a newer refresh cancels stale size-enrichment writes.
  const enrichGenRef = useRef(0);
  // Generation guard so a newer refresh/rescan cancels stale resolution writes.
  const resolveGenRef = useRef(0);
  // Latest toolbar filters. FilterToolbar owns its own state and only notifies on
  // user interaction, so async paths (resolution, deep scan, rescan) must re-apply
  // these when they repopulate the grid — otherwise the active filter is dropped.
  const filtersRef = useRef<FilterOptions>(DEFAULT_FILTERS);

  // Latest settings, readable from async callbacks (the mount scan) without a
  // stale closure.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    // Load persisted settings BEFORE the first scan, so a persisted
    // resolveOriginals is known when the scan gates on it.
    chrome.storage.sync.get(['settings'], (result) => {
      const loaded = result.settings ? withDefaults(result.settings) : DEFAULT_SETTINGS;
      settingsRef.current = loaded;
      setSettings(loaded);
      void fetchImages();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void downloadedSrcSet().then(setDownloadedSrcs);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[HISTORY_KEY]) {
        const next = (changes[HISTORY_KEY].newValue as { src: string }[] | undefined) ?? [];
        setDownloadedSrcs(new Set(next.map((e) => e.src)));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    void favouriteSrcSet().then(setFavouriteSrcs);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[FAVOURITES_KEY]) {
        const next = (changes[FAVOURITES_KEY].newValue as { src: string }[] | undefined) ?? [];
        setFavouriteSrcs(new Set(next.map((e) => e.src)));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    // Only the popup sizes the document body; the bubble is sized by its host.
    if (surface !== 'popup') return;
    document.body.style.width = `${settings.popupWidth}px`;
    document.body.style.height = `${settings.popupHeight}px`;
  }, [surface, settings.popupWidth, settings.popupHeight]);

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

  /**
   * Opt-in resolution over the full eligible set. Pending videos are already
   * displayed (as a poster, via `applyResolution`) — this resolves each item's
   * `resolveHint` via the background and swaps it in place: src becomes the
   * real original and `unresolvedVideo`/`resolveHint` are cleared, upgrading it
   * to a downloadable mp4. Also mirrors the swap into `rawImagesRef` so the
   * upgrade survives a later re-filter (settings change, deep scan). Items that
   * never resolve simply stay pending — nothing flickers in and then disappears.
   */
  const enrichOriginals = useCallback(async (eligible: ImageInfo[]): Promise<void> => {
    const generation = ++resolveGenRef.current;
    const targets = eligible.filter((i) => i.resolveHint).map((i) => ({ src: i.src, hint: i.resolveHint! }));
    if (!targets.length) return;
    const resolved = await requestResolveOriginals(targets);
    if (generation !== resolveGenRef.current) return;

    // oldSrc -> resolved item (hint cleared, src swapped to the real original)
    const byOldSrc = new Map<string, ImageInfo>();
    for (const i of eligible) {
      if (i.resolveHint && resolved[i.src]) {
        byOldSrc.set(i.src, { ...i, src: resolved[i.src], unresolvedVideo: false, resolveHint: undefined });
      }
    }
    if (!byOldSrc.size) return;
    rawImagesRef.current = rawImagesRef.current.map((m) => byOldSrc.get(m.src) ?? m);

    setState((prev) => {
      // Upgrade in place any item whose old src resolved, then append resolved
      // items that weren't already present (pending videos becoming real mp4s).
      const nextImages = prev.images.map((m) => byOldSrc.get(m.src) ?? m);
      const present = new Set(nextImages.map((m) => m.src));
      for (const [oldSrc, item] of byOldSrc) {
        if (!prev.images.some((m) => m.src === oldSrc) && !present.has(item.src)) {
          nextImages.push(item);
          present.add(item.src);
        }
      }
      // Derive the filtered view from the new image set so the active toolbar
      // filter still applies to upgraded and newly-appended items.
      return {
        ...prev,
        images: nextImages,
        filteredImages: applyToolbarFilters(nextImages, filtersRef.current),
      };
    });
  }, []);

  /**
   * Applies the resolve-originals gate to an eligible list, shared by every scan
   * path (initial scan, settings change, deep scan). Poster-only pending videos
   * ARE displayed (poster + a "Get video" action) but are excluded from the
   * downloadable set until resolved. When `resolveOriginals` is on, they are also
   * auto-resolved in the background and swapped to real mp4s. Image size
   * enrichment runs on the displayed items.
   */
  const applyResolution = useCallback(
    (eligible: ImageInfo[], s: SettingsData): void => {
      // Preserve the active toolbar filter when repopulating the grid.
      const filtered = applyToolbarFilters(eligible, filtersRef.current);
      setState((prev) => ({ ...prev, images: eligible, filteredImages: filtered }));
      if (s.resolveOriginals) void enrichOriginals(eligible);
      void enrichImageSizes(eligible);
    },
    [enrichOriginals, enrichImageSizes],
  );

  const fetchImages = useCallback(async (): Promise<void> => {
    enrichGenRef.current++; // cancel any in-flight enrichment
    resolveGenRef.current++; // cancel any in-flight resolution
    setState((prev) => ({ ...prev, isLoading: true, status: '' }));

    try {
      const imageList = await collect();
      const raw = Array.isArray(imageList) ? imageList : [];
      rawImagesRef.current = raw;
      const s = settingsRef.current; // latest settings, not a stale closure
      const eligible = filterImagesBySettings(raw, s);

      setState((prev) => ({ ...prev, status: '', isLoading: false }));
      applyResolution(eligible, s);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      setState((prev) => ({
        ...prev,
        status: `Can't read this page: ${message}`,
        isLoading: false,
      }));
    }
  }, [collect, applyResolution]);

  // Re-derive the eligible base list when the settings that affect it change.
  // Also applies opt-in resolution when it loads/changes (settings load async on
  // mount, so the first scan runs before a persisted resolveOriginals is known).
  useEffect(() => {
    if (rawImagesRef.current.length === 0) return;
    const eligible = filterImagesBySettings(rawImagesRef.current, settings);
    applyResolution(eligible, settings);
    // Keyed on the settings fields that affect eligibility + resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.minimumImageSize, settings.excludeBase64Images, settings.resolveOriginals, applyResolution]);

  const handleDeepScan = async () => {
    if (deepScanning) {
      abortDeepScan();
      return;
    }
    setDeepScanning(true);
    setDeepProgress(null);
    // The final progress event carries why the scan stopped; capture it as it streams.
    let stopReason: DeepScanStopReason | undefined;
    try {
      const found = await deepScan((p) => {
        if (p.reason) stopReason = p.reason;
        setDeepProgress(p);
      });
      const bySrc = new Map(rawImagesRef.current.map((m) => [m.src, m]));
      found.forEach((m) => {
        if (!bySrc.has(m.src)) bySrc.set(m.src, m);
      });
      const merged = [...bySrc.values()];
      rawImagesRef.current = merged;
      const eligible = filterImagesBySettings(merged, settings);
      applyResolution(eligible, settings);
      // If a cap (not a natural finish) ended the scan, tell the user media may remain.
      const capMsg = deepScanCapMessage(stopReason, merged.length);
      if (capMsg) setState((prev) => ({ ...prev, status: capMsg }));
    } catch (e) {
      setState((prev) => ({ ...prev, status: e instanceof Error ? e.message : 'deep scan failed' }));
    } finally {
      setDeepScanning(false);
    }
  };

  const handleFilterChange = (filters: FilterOptions) => {
    filtersRef.current = filters;
    setState((prev) => ({ ...prev, filteredImages: applyToolbarFilters(prev.images, filters), status: '' }));
  };

  const currentSourcePage = async (): Promise<{ url: string; title?: string }> => {
    if (surface === 'bubble') return { url: location.href, title: document.title };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { url: tab?.url ?? '', title: tab?.title };
  };

  const handleDownload = async (images: ImageInfo | ImageInfo[]): Promise<void> => {
    const imagesToDownload = Array.isArray(images) ? images : [images];
    setState((prev) => ({
      ...prev,
      status: `Sending ${imagesToDownload.length} file${imagesToDownload.length === 1 ? '' : 's'} to downloads…`,
    }));

    const sourcePage = await currentSourcePage();
    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: imagesToDownload, sourcePage };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      // chrome.runtime.lastError is only valid during this callback — capture it
      // now, not later inside the (deferred) setState updater.
      const error = chrome.runtime.lastError;
      const status = error ? `Error: ${error.message || 'unknown error'}` : response.message;
      setState((prev) => ({ ...prev, status }));
    });
  };

  const handleBulkDownload = (): void => {
    const base = state.filteredImages.length > 0 ? state.filteredImages : state.images;
    void handleDownload(downloadable(base));
  };

  const handleSingleImageDownload = (image: ImageInfo): void => void handleDownload(image);

  /**
   * Resolve ONE pending video's real file on demand, regardless of the global
   * resolveOriginals setting (this is an explicit, user-initiated request).
   * On success, swap the item's src to the mp4 (now downloadable); on failure
   * (tombstone / null), mark it failed so the tile can say so.
   */
  const handleFetchVideo = async (image: ImageInfo): Promise<void> => {
    if (!image.resolveHint) return;
    const src = image.src;
    setFetchingSrcs((p) => new Set(p).add(src));
    setResolveFailedSrcs((p) => { const n = new Set(p); n.delete(src); return n; });
    const resolved = await requestResolveOriginals([{ src, hint: image.resolveHint }]);
    setFetchingSrcs((p) => { const n = new Set(p); n.delete(src); return n; });
    const url = resolved[src];
    if (!url) {
      setResolveFailedSrcs((p) => new Set(p).add(src));
      return;
    }
    const swap = (list: ImageInfo[]) =>
      list.map((i) => (i.src === src ? { ...i, src: url, unresolvedVideo: false, resolveHint: undefined } : i));
    setState((prev) => ({ ...prev, images: swap(prev.images), filteredImages: swap(prev.filteredImages) }));
    // Mirror into the raw set too, so a later settings-change re-filter doesn't
    // revert this item back to a pending tile.
    rawImagesRef.current = swap(rawImagesRef.current);
  };

  /**
   * Resolve EVERY pending video in the current view in one batched request,
   * regardless of the resolveOriginals setting (an explicit, user-initiated
   * action). All targets show a spinner while the batch runs; each that resolves
   * is swapped to its downloadable mp4, and any that don't are flagged failed.
   */
  const handleFetchAllVideos = async (): Promise<void> => {
    const targets = pendingVideos(state.filteredImages);
    if (!targets.length) return;
    const srcs = targets.map((t) => t.src);
    setFetchingSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.add(s)); return n; });
    setResolveFailedSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.delete(s)); return n; });

    const resolved = await requestResolveOriginals(targets.map((t) => ({ src: t.src, hint: t.resolveHint! })));

    setFetchingSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.delete(s)); return n; });
    const failed = srcs.filter((s) => !resolved[s]);
    if (failed.length) setResolveFailedSrcs((p) => { const n = new Set(p); failed.forEach((s) => n.add(s)); return n; });

    const byOldSrc = new Map<string, ImageInfo>();
    for (const t of targets) {
      if (resolved[t.src]) byOldSrc.set(t.src, { ...t, src: resolved[t.src], unresolvedVideo: false, resolveHint: undefined });
    }
    if (!byOldSrc.size) return;
    const swap = (list: ImageInfo[]) => list.map((i) => byOldSrc.get(i.src) ?? i);
    rawImagesRef.current = swap(rawImagesRef.current);
    setState((prev) => ({ ...prev, images: swap(prev.images), filteredImages: swap(prev.filteredImages) }));
  };

  const handleToggleFavourite = async (image: ImageInfo): Promise<void> => {
    if (favouriteSrcs.has(image.src)) {
      chrome.runtime.sendMessage({ type: 'REMOVE_FAVOURITE', src: image.src });
      setFavouriteSrcs((prev) => {
        const next = new Set(prev);
        next.delete(image.src);
        return next;
      });
      return;
    }
    const sourcePage = await currentSourcePage();
    const entry: FavouriteEntry = {
      src: image.src,
      kind: image.kind,
      type: image.type,
      sourcePageUrl: sourcePage.url,
      time: Date.now(),
      ...(image.thumbnailSrc ?? image.poster ? { thumbnailSrc: image.thumbnailSrc ?? image.poster } : {}),
      ...(sourcePage.title ? { sourcePageTitle: sourcePage.title } : {}),
    };
    chrome.runtime.sendMessage({ type: 'ADD_FAVOURITE', entry });
    setFavouriteSrcs((prev) => new Set(prev).add(image.src));
  };

  // Single source of truth for persistence: the popup owns writing settings.
  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    chrome.storage.sync.set({ settings: newSettings });
  };

  const total = state.images.length;
  const shown = state.filteredImages.length;
  const downloadableShown = downloadable(state.filteredImages).length;
  const pendingVids = pendingVideos(state.filteredImages);
  const pendingVideoCount = pendingVids.length;
  const fetchingVideos = pendingVids.some((v) => fetchingSrcs.has(v.src));
  const hasImages = total > 0;
  const filtered = shown !== total;

  return (
    <div className="ibd-app flex h-full flex-col overflow-hidden bg-(--paper) text-(--ink)">
      {/* Header (doubles as the panel drag handle in the bubble surface) */}
      <header className="dotgrid border-b hairline" {...dragHandleProps}>
        <div className="flex items-center justify-between px-4 pt-3.5">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} className="shrink-0 rounded-sm" />
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-(--ink)">Media Bulk Downloads</h1>
              <p className="eyebrow mt-1">Collect · Filter · Save</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setShowFavourites(true)} className="iconbtn" title="Favourites" aria-label="Favourites">
              <StarIcon className="h-4.5 w-4.5" />
            </button>
            <button onClick={() => setShowHistory(true)} className="iconbtn" title="Download history" aria-label="Download history">
              <ClockIcon className="h-4.5 w-4.5" />
            </button>
            <button onClick={() => setShowSettings(true)} className="iconbtn" title="Settings" aria-label="Settings">
              <Cog6ToothIcon className="h-4.5 w-4.5" />
            </button>
            {onClose && (
              <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
                <XMarkIcon className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between px-4 pb-3.5 pt-3">
          <div className="flex items-baseline gap-2">
            <span className="num text-[30px] font-semibold leading-none text-(--ink)">
              {state.isLoading ? '—' : total}
            </span>
            <span className="text-[12px] text-(--ink-2)">
              {state.isLoading ? 'scanning this page' : total === 1 ? 'item on this page' : 'items on this page'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {deepScanning && (
              <span className="num inline-flex items-center rounded-full bg-(--brand-soft) px-2 py-0.5 text-[10px] font-semibold text-(--brand-ink)">
                {deepProgress?.found ?? 0} found
              </span>
            )}
            <button
              onClick={handleDeepScan}
              className="iconbtn"
              title={deepScanning ? 'Stop deep scan' : 'Deep scan (scroll to load more)'}
              aria-label={deepScanning ? 'Stop deep scan' : 'Deep scan'}
            >
              <ChevronDoubleDownIcon
                className={`h-4.5 w-4.5 ${deepScanning ? 'animate-pulse' : ''}`}
              />
            </button>
            <button onClick={fetchImages} className="iconbtn" title="Rescan page" aria-label="Rescan page">
              <ArrowPathIcon className={`h-4.5 w-4.5 ${state.isLoading ? 'animate-[spin_0.9s_linear_infinite]' : ''}`} />
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
          // A page-read failure and a page with simply no media are different
          // situations and should read differently.
          state.status ? (
            <ErrorState message={state.status} onRetry={fetchImages} />
          ) : (
            <EmptyState onRefresh={fetchImages} />
          )
        ) : (
          <ImageList
            images={state.filteredImages}
            onImageDownload={handleSingleImageDownload}
            thumbnailSize={settings.thumbnailSize}
            previewSize={settings.previewSize}
            downloadedSrcs={downloadedSrcs}
            favouriteSrcs={favouriteSrcs}
            onToggleFavourite={handleToggleFavourite}
            onFetchVideo={handleFetchVideo}
            resolveFailedSrcs={resolveFailedSrcs}
            fetchingSrcs={fetchingSrcs}
          />
        )}
      </main>

      {/* Action bar */}
      {hasImages && !state.isLoading && (
        <footer className="flex items-center justify-between gap-3 border-t hairline bg-(--panel) px-4 py-2.5">
          <p className="num min-w-0 flex-1 truncate text-[11px] text-(--ink-2)">
            {state.status ? (
              state.status
            ) : (
              <>
                <span className="text-(--ink)">{shown}</span>
                <span className="text-(--ink-3)"> / {total}</span>
                {filtered && <span className="text-(--ink-3)"> shown</span>}
              </>
            )}
          </p>
          {pendingVideoCount > 0 && (
            <button
              onClick={() => void handleFetchAllVideos()}
              disabled={fetchingVideos}
              className="btn btn-ghost flex-none"
              title="Fetch every pending video's real file over the network"
            >
              <VideoCameraIcon className={`h-4 w-4 ${fetchingVideos ? 'animate-pulse' : ''}`} />
              <span>{fetchingVideos ? 'Fetching…' : `Get all videos (${pendingVideoCount})`}</span>
            </button>
          )}
          <button onClick={handleBulkDownload} disabled={downloadableShown === 0} className="btn btn-primary flex-none">
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span>Download{downloadableShown > 0 ? ` ${downloadableShown}` : ''}</span>
          </button>
        </footer>
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} onSettingsChange={handleSettingsChange} settings={settings} />
      )}

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}

      {showFavourites && <FavouritesPanel onClose={() => setShowFavourites(false)} />}
    </div>
  );
};

export default App;
