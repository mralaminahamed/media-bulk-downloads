import React, { useEffect, useState } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/panels/Settings';
import HistoryPanel from './components/panels/HistoryPanel';
import FavouritesPanel from './components/panels/FavouritesPanel';
import ExcludedPanel from './components/panels/ExcludedPanel';
import FilterToolbar from './components/FilterToolbar';
import { DownloadButton } from './components/DownloadButton';
import { ProgressBar } from './components/ProgressBar';
import { DownloadQueue } from './components/DownloadQueue';
import { SaveAsPromptHint } from './components/SaveAsPromptHint';
import { SelectCheckbox } from './components/fields/SelectCheckbox';
import { BrandMark } from '../components/BrandMark';
import { SkeletonGrid } from './components/states/SkeletonGrid';
import { EmptyState } from './components/states/EmptyState';
import { ErrorState } from './components/states/ErrorState';
import { AppProps, DownloadMessage, DownloadResponse, DownloadZipMessage, DownloadBytesMessage, ExcludedKind, ImageInfo } from '@/types';
import { collectFromActiveTab } from '../shared/active-tab/collect-active-tab';
import { deepScanActiveTab, abortDeepScanActiveTab } from '../shared/active-tab/deep-scan-active-tab';
import { buildZip, zipFileName } from '../shared/download/zip';
import { convertImage, isConvertible } from '../shared/download/convert/convert';
import { u8ToBase64 } from '../shared/download/base64';
import { buildDownloadFilename } from '../shared/collection/download-name';
import { hostFromUrl, registrableDomain, todayISO } from '../shared/collection/paths';
import { requestCaptureStream } from '../shared/active-tab/capture-stream-active';
import { copyText, downloadText, mapWithConcurrency, sendRuntimeMessage } from './utils';
import { Cog6ToothIcon, ArrowPathIcon, ChevronDoubleDownIcon, ClockIcon, XMarkIcon, StarIcon, VideoCameraIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import { downloadable, pendingVideos } from './lib/appHelpers';
import { useDownloadHistory } from './hooks/useDownloadHistory';
import { useFavourites } from './hooks/useFavourites';
import { useExcluded } from './hooks/useExcluded';
import { useSelection } from './hooks/useSelection';
import { useSettings } from './hooks/useSettings';
import { useMediaEngine } from './hooks/useMediaEngine';

const App: React.FC<AppProps> = ({
  collect = collectFromActiveTab,
  deepScan = deepScanActiveTab,
  abortDeepScan = abortDeepScanActiveTab,
  surface = 'popup',
  onClose,
  dragHandleProps,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { downloadedSrcs, isDownloaded } = useDownloadHistory();
  const [showFavourites, setShowFavourites] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  // Selective bulk download: srcs the user has ticked. Scoped to what's shown —
  // pruned whenever the filtered view changes (see the effect below).
  const { selectedSrcs, setSelectedSrcs, handleToggleSelect, handleSelectRange, handleSelectAllShown, handleClearSelection } = useSelection();

  // Defined here (ahead of its other call sites further down) so it's already
  // initialized when useFavourites (below) is called — useFavourites must be
  // called at this position, not later, to preserve the favourites listener's
  // registration order (after history, before settings-sync/excluded; see the
  // comment on the useSettings() call below).
  const currentSourcePage = async (): Promise<{ url: string; title?: string }> => {
    if (surface === 'bubble') return { url: location.href, title: document.title };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { url: tab?.url ?? '', title: tab?.title };
  };

  const { favouriteSrcs, handleToggleFavourite } = useFavourites(currentSourcePage);

  // Called here — between useFavourites (above) and useExcluded (below) — so
  // its sync 'settings' storage listener keeps its registration order
  // relative to the favourites/excluded local listeners (tests depend on it).
  const { settings, setSettings, settingsRef, handleSettingsChange } = useSettings();

  const { excludedMatch, excludedRef, applyExcludedOptimistic } = useExcluded();

  useEffect(() => {
    // Only the popup sizes the document body; the bubble is sized by its host.
    if (surface !== 'popup') return;
    document.body.style.width = `${settings.popupWidth}px`;
    document.body.style.height = `${settings.popupHeight}px`;
  }, [surface, settings.popupWidth, settings.popupHeight]);

  // The coupled scan/resolution/filter core: owns `state` (the collected +
  // filtered image sets) and the refs that must stay in sync with it. Called
  // after useSettings/useExcluded/useDownloadHistory so their return values
  // are already initialized when threaded in as inputs.
  const {
    state,
    setState,
    deepScanning,
    deepProgress,
    progress,
    setProgress,
    fetchImages,
    handleDeepScan,
    handleFilterChange,
    handleFetchVideo,
    handleFetchAllVideos,
    fetchingAllVideos,
    fetchingSrcs,
    resolveFailedSrcs,
  } = useMediaEngine({
    settings,
    settingsRef,
    setSettings,
    excludedRef,
    excludedMatch,
    isDownloaded,
    downloadedSrcs,
    collect,
    deepScan,
    abortDeepScan,
  });

  const handleDownload = async (images: ImageInfo | ImageInfo[]): Promise<void> => {
    const list = Array.isArray(images) ? images : [images];
    // HLS streams are captured (fetch + assemble segments), not fetched as a
    // single file — route them to the capture path, sequentially.
    const streams = list.filter((i) => i.hlsManifest);
    for (const s of streams) await captureStream(s);
    const rest = list.filter((i) => !i.hlsManifest);
    if (!rest.length) return;
    const target = settings.convertImagesTo;
    if (target === 'off') {
      await sendPlainDownload(rest);
      return;
    }
    await convertAndDownload(rest, target);
  };

  /**
   * Capture an HLS stream. The heavy lifting (fetch + mux + blob) runs in the
   * background's offscreen document; this only fires the request, mirrors progress
   * into the ProgressBar, and shows the status the background composes. The
   * capture completes even if the popup closes before this resolves.
   */
  const captureStream = async (item: ImageInfo): Promise<void> => {
    const sourcePage = await currentSourcePage();
    setProgress({ label: 'Capturing stream', done: 0, total: 0 });
    try {
      const status = await requestCaptureStream(
        item,
        sourcePage,
        (done, total) => setProgress({ label: 'Capturing stream', done, total }),
      );
      setState((prev) => ({ ...prev, status }));
    } finally {
      setProgress(null);
    }
  };

  /** The original, fast path: hand the source URLs to the background to download. */
  const sendPlainDownload = async (list: ImageInfo[]): Promise<void> => {
    setState((prev) => ({
      ...prev,
      status: `Sending ${list.length} file${list.length === 1 ? '' : 's'} to downloads…`,
    }));
    const sourcePage = await currentSourcePage();
    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: list, sourcePage };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      // chrome.runtime.lastError is only valid during this callback — capture it now.
      const error = chrome.runtime.lastError;
      const status = error ? `Error: ${error.message || 'unknown error'}` : response.message;
      setState((prev) => ({ ...prev, status }));
    });
  };

  /**
   * Convert-on-download: raster images are fetched, re-encoded to the target
   * format via canvas, and saved as bytes. Non-convertible items (video/audio,
   * svg, gif, already-target) and any that fail download in their original form.
   */
  const convertAndDownload = async (list: ImageInfo[], target: 'png' | 'jpeg'): Promise<void> => {
    const toConvert = list.filter((i) => isConvertible(i, target));
    const passthrough = list.filter((i) => !isConvertible(i, target));
    const sourcePage = await currentSourcePage();

    if (passthrough.length) {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', images: passthrough, sourcePage } as DownloadMessage);
    }
    if (!toConvert.length) {
      setState((prev) => ({ ...prev, status: `Sent ${passthrough.length} file${passthrough.length === 1 ? '' : 's'} to downloads…` }));
      return;
    }

    setProgress({ label: 'Converting', done: 0, total: toConvert.length });
    let done = 0;
    const failed: ImageInfo[] = [];
    await mapWithConcurrency(toConvert, 3, async (img, index) => {
      try {
        const res = await fetch(img.src);
        if (!res.ok) throw new Error('fetch');
        // preserve metadata unless the user explicitly chose to strip it. If the
        // source's metadata can't be carried across, convertImage returns null and
        // the item falls through to a plain download of the original (below).
        const converted = await convertImage(await res.blob(), target, {
          preserveMetadata: settings.convertMetadata !== 'strip',
        });
        if (!converted) throw new Error('convert');
        const filename = buildDownloadFilename({ ...img, ext: converted.ext }, index, settings, sourcePage.url);
        const msg: DownloadBytesMessage = {
          type: 'DOWNLOAD_BYTES', filename, b64: u8ToBase64(converted.bytes), mime: converted.mime,
          // Carry the original identity so the background records it to history
          // (the "already downloaded" mark + dedup), like a plain download.
          source: {
            src: img.src, kind: img.kind, type: img.type,
            ...(img.thumbnailSrc ?? img.poster ? { thumbnailSrc: img.thumbnailSrc ?? img.poster } : {}),
            sourcePageUrl: sourcePage.url,
            ...(sourcePage.title ? { sourcePageTitle: sourcePage.title } : {}),
          },
        };
        chrome.runtime.sendMessage(msg);
      } catch {
        failed.push(img);
      } finally {
        setProgress({ label: 'Converting', done: ++done, total: toConvert.length });
      }
    });
    setProgress(null);

    // Anything that couldn't be fetched/decoded downloads in its original format.
    if (failed.length) {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', images: failed, sourcePage } as DownloadMessage);
    }
    const okCount = toConvert.length - failed.length;
    const note = failed.length ? ` ${failed.length} couldn't convert — saved original.` : '';
    setState((prev) => ({ ...prev, status: `Converted ${okCount} image${okCount === 1 ? '' : 's'} to ${target.toUpperCase()}.${note}` }));
  };

  const handleBulkDownload = (): void => {
    // Always act on the shown (filtered) set — never fall back to the unfiltered
    // images, which would ignore the active filter.
    void handleDownload(downloadable(state.filteredImages));
  };

  const handleSingleImageDownload = (image: ImageInfo): void => void handleDownload(image);

  // ── Selective bulk download ────────────────────────────────────────────────
  const handleDownloadSelected = (): void => {
    const chosen = downloadable(state.filteredImages).filter((i) => selectedSrcs.has(i.src));
    if (chosen.length) void handleDownload(chosen);
  };

  // ── ZIP download ───────────────────────────────────────────────────────────
  // Fetch + zip the media in this (extension) context — fetch here bypasses page
  // CORS — then hand the bytes to the background to write via chrome.downloads.
  const handleDownloadZip = async (images: ImageInfo[]): Promise<void> => {
    if (!images.length) return;
    setProgress({ label: 'Zipping', done: 0, total: images.length });

    const sourcePage = await currentSourcePage();
    const { bytes, ok, failed } = await buildZip(images, settings, sourcePage.url, {
      fetch: (...args) => fetch(...args),
      onProgress: (done, total) => setProgress({ label: 'Zipping', done, total }),
    });
    setProgress(null); // fetch phase done; the download itself is near-instant

    // Nothing could be fetched (every host blocked the hotlink / offline) — fall
    // back to individual downloads via the browser's own fetch. Use the plain
    // path, not handleDownload: the ZIP action archives originals, so its
    // fallback must not convert either (convert-on-download applies only to the
    // separate-files action). `images` is already the downloadable set (no HLS).
    if (ok === 0) {
      void sendPlainDownload(images);
      return;
    }

    // Items that failed to fetch fall back to a normal per-file download
    // (fire-and-forget; the ZIP response owns the status line).
    if (failed.length) {
      const fallback: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: failed, sourcePage };
      chrome.runtime.sendMessage(fallback);
    }

    const filename = zipFileName(sourcePage.url);
    const message: DownloadZipMessage = { type: 'DOWNLOAD_ZIP', b64: u8ToBase64(bytes), filename };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      const error = chrome.runtime.lastError;
      const base = error ? `Error: ${error.message || 'unknown error'}` : response.message;
      const note = failed.length ? ` ${failed.length} couldn't be fetched — downloading those individually.` : '';
      setState((prev) => ({ ...prev, status: `${base}${note}` }));
    });
  };

  const handleBulkDownloadZip = (): void => void handleDownloadZip(downloadable(state.filteredImages));

  const handleDownloadSelectedZip = (): void => {
    const chosen = downloadable(state.filteredImages).filter((i) => selectedSrcs.has(i.src));
    if (chosen.length) void handleDownloadZip(chosen);
  };

  // ── Copy / export links ──────────────────────────────────────────────────
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  const linkList = (images: ImageInfo[]): string => images.map((i) => i.src).join('\n');
  const linksFileName = (url?: string): string => {
    const domain = registrableDomain(hostFromUrl(url));
    return `${domain ? `${domain}-` : ''}media-links-${todayISO()}.txt`;
  };

  const handleCopyLinks = async (images: ImageInfo[]): Promise<void> => {
    if (!images.length) return;
    const ok = await copyText(linkList(images));
    setState((prev) => ({ ...prev, status: ok ? `Copied ${plural(images.length, 'link')}.` : 'Copy failed — clipboard blocked.' }));
  };

  const handleExportLinks = async (images: ImageInfo[]): Promise<void> => {
    if (!images.length) return;
    const { url } = await currentSourcePage();
    downloadText(linksFileName(url), linkList(images), 'text/plain');
    setState((prev) => ({ ...prev, status: `Exported ${plural(images.length, 'link')}.` }));
  };

  const selectedDownloadable = (): ImageInfo[] => downloadable(state.filteredImages).filter((i) => selectedSrcs.has(i.src));

  // Keep the selection scoped to what's currently shown: drop any ticked src that
  // a filter change or rescan removed from the downloadable view.
  useEffect(() => {
    setSelectedSrcs((prev) => {
      if (prev.size === 0) return prev;
      const shown = new Set(downloadable(state.filteredImages).map((i) => i.src));
      let changed = false;
      const next = new Set<string>();
      for (const s of prev) {
        if (shown.has(s)) next.add(s);
        else changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.filteredImages]);

  const excludeItem = (image: ImageInfo, kind: ExcludedKind): void => {
    const value = kind === 'host' ? registrableDomain(hostFromUrl(image.src)) : image.src;
    if (!value) return;
    sendRuntimeMessage({ type: 'ADD_EXCLUDED', entry: { value, kind, time: Date.now() } });
    applyExcludedOptimistic([{ kind, value, src: image.src }]);
  };
  const excludeSelected = (): void => {
    const items = selectedDownloadable();
    for (const i of items) sendRuntimeMessage({ type: 'ADD_EXCLUDED', entry: { value: i.src, kind: 'url', time: Date.now() } });
    applyExcludedOptimistic(items.map((i) => ({ kind: 'url' as const, value: i.src, src: i.src })));
    setSelectedSrcs(new Set());
  };

  const total = state.images.length;
  const shown = state.filteredImages.length;
  const downloadableShown = downloadable(state.filteredImages).length;
  const pendingVids = pendingVideos(state.filteredImages);
  const pendingVideoCount = pendingVids.length;
  // The batch button reflects a batch run only — a single per-item fetch (which
  // adds one src to fetchingSrcs) must not disable "Get all videos".
  const fetchingVideos = fetchingAllVideos;
  const hasImages = total > 0;
  const filtered = shown !== total;
  const selectedCount = selectedSrcs.size;
  const allShownSelected = downloadableShown > 0 && selectedCount === downloadableShown;

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
            <button onClick={() => setShowExcluded(true)} className="iconbtn" title="Excluded sources" aria-label="Excluded sources">
              <NoSymbolIcon className="h-4.5 w-4.5" />
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
            onExclude={excludeItem}
            onFetchVideo={handleFetchVideo}
            resolveFailedSrcs={resolveFailedSrcs}
            fetchingSrcs={fetchingSrcs}
            selectedSrcs={selectedSrcs}
            selectionActive={selectedCount > 0}
            onToggleSelect={handleToggleSelect}
            onSelectRange={handleSelectRange}
          />
        )}
      </main>

      <SaveAsPromptHint />

      {/* Persistent download queue: per-file status + pause/resume/cancel/retry
          (#196). Renders nothing when the queue is empty. */}
      <DownloadQueue />

      {/* Action bar */}
      {hasImages && !state.isLoading && (
        <footer className="flex items-center justify-between gap-3 border-t hairline bg-(--panel) px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {downloadableShown > 0 && (
              <SelectCheckbox
                checked={allShownSelected}
                indeterminate={selectedCount > 0 && !allShownSelected}
                onClick={() => (allShownSelected ? handleClearSelection() : handleSelectAllShown(state.filteredImages))}
                className="shrink-0 cursor-pointer"
                title={allShownSelected ? 'Clear selection' : 'Select all shown'}
                ariaLabel={allShownSelected ? 'Clear selection' : 'Select all shown'}
              />
            )}
            {progress ? (
              <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
            ) : (
            <p className="num min-w-0 truncate text-[11px] text-(--ink-2)">
              {state.status ? (
                // A status line is sticky (cleared only on rescan/filter), so keep the
                // Clear affordance reachable when a selection is still live underneath it.
                <>
                  {state.status}
                  {selectedCount > 0 && (
                    <button onClick={handleClearSelection} className="ml-1.5 text-(--ink-3) underline-offset-2 hover:text-(--ink) hover:underline">
                      Clear
                    </button>
                  )}
                </>
              ) : selectedCount > 0 ? (
                <>
                  <span className="text-(--ink)">{selectedCount}</span> selected
                  <button onClick={handleClearSelection} className="ml-1.5 text-(--ink-3) underline-offset-2 hover:text-(--ink) hover:underline">
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <span className="text-(--ink)">{shown}</span>
                  <span className="text-(--ink-3)"> / {total}</span>
                  {filtered && <span className="text-(--ink-3)"> shown</span>}
                </>
              )}
            </p>
            )}
          </div>
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
          {selectedCount > 0 ? (
            <DownloadButton
              label="Download selected"
              count={selectedCount}
              onDownload={handleDownloadSelected}
              onZip={handleDownloadSelectedZip}
              onCopyLinks={() => void handleCopyLinks(selectedDownloadable())}
              onExportLinks={() => void handleExportLinks(selectedDownloadable())}
              onExclude={excludeSelected}
            />
          ) : (
            <DownloadButton
              label="Download"
              count={downloadableShown > 0 ? downloadableShown : undefined}
              disabled={downloadableShown === 0}
              onDownload={handleBulkDownload}
              onZip={handleBulkDownloadZip}
              onCopyLinks={() => void handleCopyLinks(downloadable(state.filteredImages))}
              onExportLinks={() => void handleExportLinks(downloadable(state.filteredImages))}
            />
          )}
        </footer>
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} onSettingsChange={handleSettingsChange} settings={settings} />
      )}

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}

      {showFavourites && <FavouritesPanel onClose={() => setShowFavourites(false)} />}

      {showExcluded && <ExcludedPanel onClose={() => setShowExcluded(false)} />}
    </div>
  );
};

export default App;
