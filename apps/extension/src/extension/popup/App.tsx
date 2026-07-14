import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageList from '@/extension/popup/components/ImageList';
import Settings from '@/extension/popup/components/panels/Settings';
import HistoryPanel from '@/extension/popup/components/panels/HistoryPanel';
import FavouritesPanel from '@/extension/popup/components/panels/FavouritesPanel';
import ExcludedPanel from '@/extension/popup/components/panels/ExcludedPanel';
import FilterToolbar from '@/extension/popup/components/FilterToolbar';
import { DownloadButton } from '@/extension/popup/components/DownloadButton';
import { StreamHandoff } from '@/extension/popup/components/StreamHandoff';
import { ProgressBar } from '@/extension/popup/components/ProgressBar';
import { DownloadQueue } from '@/extension/popup/components/DownloadQueue';
import { SaveAsPromptHint } from '@/extension/popup/components/SaveAsPromptHint';
import { SelectCheckbox } from '@/extension/popup/components/fields/SelectCheckbox';
import { BrandMark } from '@/extension/components/BrandMark';
import { SkeletonGrid } from '@/extension/popup/components/states/SkeletonGrid';
import { EmptyState } from '@/extension/popup/components/states/EmptyState';
import { ErrorState } from '@/extension/popup/components/states/ErrorState';
import { AppProps, CollectScope, ExcludedKind, ImageInfo } from '@mbd/core/types';
import { collectFromActiveTab } from '@/extension/shared/active-tab/collect-active-tab';
import { collectOpenTabs } from '@/extension/shared/active-tab/collect-open-tabs';
import TabPickerPanel from '@/extension/popup/components/panels/TabPickerPanel';
import { deriveFilterOptions } from '@mbd/core/collection/filters';
import { deepScanActiveTab, abortDeepScanActiveTab } from '@/extension/shared/active-tab/deep-scan-active-tab';
import { hostFromUrl, registrableDomain } from '@mbd/core/collection/paths';
import { sendRuntimeMessage } from '@/extension/popup/utils';
import { Cog6ToothIcon, ArrowPathIcon, ChevronDoubleDownIcon, ClockIcon, XMarkIcon, StarIcon, VideoCameraIcon, NoSymbolIcon, Square2StackIcon } from '@heroicons/react/24/outline';
import { downloadable, pendingVideos } from '@/extension/popup/lib/appHelpers';
import { useDownloadHistory } from '@/extension/popup/hooks/useDownloadHistory';
import { useFavourites } from '@/extension/popup/hooks/useFavourites';
import { useExcluded } from '@/extension/popup/hooks/useExcluded';
import { useSelection } from '@/extension/popup/hooks/useSelection';
import { useSettings } from '@/extension/popup/hooks/useSettings';
import { useMediaEngine } from '@/extension/popup/hooks/useMediaEngine';
import { useNearDuplicates } from '@/extension/popup/hooks/useNearDuplicates';
import { useDownloadActions, StreamRefusal } from '@/extension/popup/hooks/useDownloadActions';
import { usePerHostSettings } from '@/extension/popup/hooks/usePerHostSettings';

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
  // Multi-tab collection scope (#283). Popup-only — the bubble has no chrome.tabs.
  // Refs mirror the state so the `collect` closure below stays identity-stable
  // (no useMediaEngine effect thrash) while always reading the latest scope.
  const [scope, setScope] = useState<CollectScope>('active');
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [showTabPicker, setShowTabPicker] = useState(false);
  // Result banner for the last multi-tab scan (null for active-tab scope).
  const [multiTabInfo, setMultiTabInfo] = useState<{ scanned: number; skipped: number } | null>(null);
  // Per-tab progress during a multi-tab scan ("scanning 3/12 tabs"); null when idle.
  const [tabScanProgress, setTabScanProgress] = useState<{ done: number; total: number } | null>(null);
  // Written imperatively by changeScope (the only place scope/selection changes)
  // right before it rescans, so the collect closure reads the latest without a
  // render-time ref access.
  const scopeRef = useRef<CollectScope>(scope);
  const selectedTabIdsRef = useRef<number[]>(selectedTabIds);
  // A refused stream capture (#285) → the "Copy download command" handoff banner.
  // Set by useDownloadActions on refusal, cleared on a new attempt or a rescan.
  const [streamRefusal, setStreamRefusal] = useState<StreamRefusal | null>(null);
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
  const { settings, handleSettingsChange } = useSettings();
  const perHost = usePerHostSettings(currentSourcePage, settings);

  // Scope-aware collector fed to the engine. 'active' delegates to the injected
  // active-tab `collect` (unchanged); 'all-tabs'/'selected' fan out over the
  // window's tabs, reporting per-tab progress and a scanned/skipped tally. Stable
  // identity (deps = [collect]) — it reads scope/selection via refs.
  const scopedCollect = useCallback(async (): Promise<ImageInfo[]> => {
    if (scopeRef.current === 'active') {
      setMultiTabInfo(null);
      return collect();
    }
    const tabIds = scopeRef.current === 'selected' ? selectedTabIdsRef.current : undefined;
    setTabScanProgress({ done: 0, total: 0 });
    try {
      const { items, scanned, skipped } = await collectOpenTabs({
        tabIds,
        onProgress: (done, total) => setTabScanProgress({ done, total }),
      });
      setMultiTabInfo({ scanned, skipped });
      return items;
    } finally {
      setTabScanProgress(null);
    }
  }, [collect]);

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
    rawImagesRef,
    filtersRef,
    filterSeed,
  } = useMediaEngine({
    settings: perHost.effective,
    settingsRef: perHost.effectiveRef,
    loadSettings: perHost.loadEffective,
    excludedRef,
    excludedMatch,
    isDownloaded,
    downloadedSrcs,
    collect: scopedCollect,
    deepScan,
    abortDeepScan,
  });

  // Switch collection scope and immediately rescan. Sets the ref synchronously so
  // the scopedCollect fired by fetchImages reads the NEW scope, not next render's.
  const changeScope = useCallback(
    (next: CollectScope, tabIds?: number[]): void => {
      scopeRef.current = next;
      setScope(next);
      if (tabIds) {
        selectedTabIdsRef.current = tabIds;
        setSelectedTabIds(tabIds);
      }
      setStreamRefusal(null);
      void fetchImages();
    },
    [fetchImages],
  );

  // On-demand perceptual-hash near-duplicate pass (#198). Hashes the eligible
  // images in a worker, marks near-duplicates, and hides them behind the default
  // duplicateState filter — reversible via the Duplicates chip.
  const nearDup = useNearDuplicates({
    rawImagesRef,
    settingsRef: perHost.effectiveRef,
    excludedRef,
    filtersRef,
    isDownloaded,
    setState,
  });

  const {
    handleBulkDownload,
    handleSingleImageDownload,
    handleCaptureAudio,
    handleDownloadSelected,
    handleBulkDownloadZip,
    handleDownloadSelectedZip,
    handleCopyLinks,
    handleExportLinks,
  } = useDownloadActions({
    settings: perHost.effective,
    filteredImages: state.filteredImages,
    selectedSrcs,
    setState,
    setProgress,
    currentSourcePage,
    onStreamRefused: setStreamRefusal,
  });

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

  // Data-driven filter option lists (#292) — derived from the unfiltered
  // collected set so a filter never hides its own option list, and memoized so
  // FilterToolbar's stale-selection-reset effect only fires when the option
  // set actually changes, not on every render.
  const availableFilterOptions = useMemo(() => deriveFilterOptions(state.images), [state.images]);

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
  // Near-duplicate accounting (#198): how many the pass marked, and how many of
  // those are currently hidden (marked AND absent from the shown grid — so this
  // auto-reflects the Duplicates filter without tracking its value here).
  const nearDuplicateCount = useMemo(() => state.images.reduce((n, i) => n + (i.nearDuplicate ? 1 : 0), 0), [state.images]);
  const hiddenNearDuplicates = useMemo(() => {
    if (nearDuplicateCount === 0) return 0;
    const shownSrcs = new Set(state.filteredImages.map((i) => i.src));
    return state.images.reduce((n, i) => n + (i.nearDuplicate && !shownSrcs.has(i.src) ? 1 : 0), 0);
  }, [state.images, state.filteredImages, nearDuplicateCount]);
  const selectedCount = selectedSrcs.size;
  const allShownSelected = downloadableShown > 0 && selectedCount === downloadableShown;

  return (
    <div className="ibd-app mbd:flex mbd:h-full mbd:flex-col mbd:overflow-hidden mbd:bg-(--paper) mbd:text-(--ink)">
      {/* Header (doubles as the panel drag handle in the bubble surface) */}
      <header className="dotgrid mbd:border-b hairline" {...dragHandleProps}>
        <div className="mbd:flex mbd:items-center mbd:justify-between mbd:px-4 mbd:pt-3.5">
          <div className="mbd:flex mbd:items-center mbd:gap-2.5">
            <BrandMark size={32} className="mbd:shrink-0 mbd:rounded-sm" />
            <div className="mbd:leading-tight">
              <h1 className="mbd:text-[15px] mbd:font-semibold mbd:tracking-tight mbd:text-(--ink)">Media Bulk Downloads</h1>
              <p className="eyebrow mbd:mt-1">Collect · Filter · Save</p>
            </div>
          </div>
          <div className="mbd:flex mbd:items-center mbd:gap-0.5">
            <button onClick={() => setShowFavourites(true)} className="iconbtn" title="Favourites" aria-label="Favourites">
              <StarIcon className="mbd:h-4.5 mbd:w-4.5" />
            </button>
            <button onClick={() => setShowExcluded(true)} className="iconbtn" title="Excluded sources" aria-label="Excluded sources">
              <NoSymbolIcon className="mbd:h-4.5 mbd:w-4.5" />
            </button>
            <button onClick={() => setShowHistory(true)} className="iconbtn" title="Download history" aria-label="Download history">
              <ClockIcon className="mbd:h-4.5 mbd:w-4.5" />
            </button>
            <button onClick={() => setShowSettings(true)} className="iconbtn" title="Settings" aria-label="Settings">
              <Cog6ToothIcon className="mbd:h-4.5 mbd:w-4.5" />
            </button>
            {onClose && (
              <button onClick={onClose} className="iconbtn" title="Close" aria-label="Close">
                <XMarkIcon className="mbd:h-4.5 mbd:w-4.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mbd:flex mbd:items-end mbd:justify-between mbd:px-4 mbd:pb-3.5 mbd:pt-3">
          <div className="mbd:flex mbd:items-baseline mbd:gap-2">
            <span className="num mbd:text-[30px] mbd:font-semibold mbd:leading-none mbd:text-(--ink)">
              {state.isLoading ? '—' : total}
            </span>
            <span className="mbd:text-[12px] mbd:text-(--ink-2)">
              {state.isLoading
                ? tabScanProgress && tabScanProgress.total > 0
                  ? `scanning ${tabScanProgress.done}/${tabScanProgress.total} tabs`
                  : scope !== 'active'
                    ? 'scanning tabs'
                    : 'scanning this page'
                : total === 1
                  ? 'item on this page'
                  : 'items on this page'}
            </span>
          </div>
          <div className="mbd:flex mbd:items-center mbd:gap-1.5">
            {surface === 'popup' && (
              <select
                aria-label="Collection scope"
                title="Which tabs to collect from"
                value={scope}
                onChange={(e) => {
                  const next = e.target.value as CollectScope;
                  if (next === 'selected') { setShowTabPicker(true); return; } // pick tabs, then rescan
                  changeScope(next);
                }}
                className="field mbd:shrink-0 mbd:py-0 mbd:text-[12px]"
                style={{ height: 30 }}
                disabled={state.isLoading}
              >
                <option value="active">This tab</option>
                <option value="all-tabs">All tabs</option>
                <option value="selected">{selectedTabIds.length > 0 ? `Selected (${selectedTabIds.length})` : 'Selected tabs…'}</option>
              </select>
            )}
            {deepScanning && (
              <span className="num mbd:inline-flex mbd:items-center mbd:rounded-full mbd:bg-(--brand-soft) mbd:px-2 mbd:py-0.5 mbd:text-[10px] mbd:font-semibold mbd:text-(--brand-ink)">
                {deepProgress?.found ?? 0} found
              </span>
            )}
            {nearDup.running && nearDup.progress && (
              <span className="num mbd:inline-flex mbd:items-center mbd:rounded-full mbd:bg-(--brand-soft) mbd:px-2 mbd:py-0.5 mbd:text-[10px] mbd:font-semibold mbd:text-(--brand-ink)">
                {nearDup.progress.done}/{nearDup.progress.total} hashing
              </span>
            )}
            <button
              onClick={handleDeepScan}
              className="iconbtn"
              title={deepScanning ? 'Stop deep scan' : 'Deep scan (scroll to load more)'}
              aria-label={deepScanning ? 'Stop deep scan' : 'Deep scan'}
            >
              <ChevronDoubleDownIcon
                className={`mbd:h-4.5 mbd:w-4.5 ${deepScanning ? 'mbd:animate-pulse' : ''}`}
              />
            </button>
            {hasImages && !state.isLoading && (
              <button
                onClick={() => (nearDup.running ? nearDup.cancel() : void nearDup.run())}
                className="iconbtn"
                title={nearDup.running ? 'Stop near-duplicate scan' : 'Find near-duplicates (fetches & hashes images)'}
                aria-label={nearDup.running ? 'Stop near-duplicate scan' : 'Find near-duplicates'}
              >
                <Square2StackIcon className={`mbd:h-4.5 mbd:w-4.5 ${nearDup.running ? 'mbd:animate-pulse' : ''}`} />
              </button>
            )}
            <button onClick={() => { setStreamRefusal(null); fetchImages(); }} className="iconbtn" title="Rescan page" aria-label="Rescan page">
              <ArrowPathIcon className={`mbd:h-4.5 mbd:w-4.5 ${state.isLoading ? 'mbd:animate-[spin_0.9s_linear_infinite]' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      {hasImages && !state.isLoading && (
        <FilterToolbar onFilterChange={handleFilterChange} extensionSettings={perHost.effective} available={availableFilterOptions} initialFilters={filterSeed} nearDuplicateCount={nearDuplicateCount} />
      )}

      {/* Body */}
      <main className="scroll-thin mbd:flex-1 mbd:overflow-y-auto mbd:px-4 mbd:py-3">
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
            onCaptureAudio={handleCaptureAudio}
            audioFormat={settings.audioFormat}
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

      {/* Refused-stream handoff (#285): copy a yt-dlp / ffmpeg command instead. */}
      {streamRefusal && (
        <StreamHandoff key={`${streamRefusal.item.src}:${streamRefusal.code}`} refusal={streamRefusal} onDismiss={() => setStreamRefusal(null)} />
      )}

      {/* Action bar */}
      {hasImages && !state.isLoading && (
        <footer className="mbd:flex mbd:items-center mbd:justify-between mbd:gap-3 mbd:border-t hairline mbd:bg-(--panel) mbd:px-4 mbd:py-2.5">
          <div className="mbd:flex mbd:min-w-0 mbd:flex-1 mbd:items-center mbd:gap-2">
            {downloadableShown > 0 && (
              <SelectCheckbox
                checked={allShownSelected}
                indeterminate={selectedCount > 0 && !allShownSelected}
                onClick={() => (allShownSelected ? handleClearSelection() : handleSelectAllShown(state.filteredImages))}
                className="mbd:shrink-0 mbd:cursor-pointer"
                title={allShownSelected ? 'Clear selection' : 'Select all shown'}
                ariaLabel={allShownSelected ? 'Clear selection' : 'Select all shown'}
              />
            )}
            {progress ? (
              <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
            ) : (
            <p className="num mbd:min-w-0 mbd:truncate mbd:text-[11px] mbd:text-(--ink-2)">
              {state.status ? (
                // A status line is sticky (cleared only on rescan/filter), so keep the
                // Clear affordance reachable when a selection is still live underneath it.
                <>
                  {state.status}
                  {selectedCount > 0 && (
                    <button onClick={handleClearSelection} className="mbd:ml-1.5 mbd:text-(--ink-3) mbd:underline-offset-2 mbd:hover:text-(--ink) mbd:hover:underline">
                      Clear
                    </button>
                  )}
                </>
              ) : selectedCount > 0 ? (
                <>
                  <span className="mbd:text-(--ink)">{selectedCount}</span> selected
                  <button onClick={handleClearSelection} className="mbd:ml-1.5 mbd:text-(--ink-3) mbd:underline-offset-2 mbd:hover:text-(--ink) mbd:hover:underline">
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <span className="mbd:text-(--ink)">{shown}</span>
                  <span className="mbd:text-(--ink-3)"> / {total}</span>
                  {filtered && <span className="mbd:text-(--ink-3)"> shown</span>}
                  {hiddenNearDuplicates > 0 && (
                    <span className="mbd:text-(--ink-3)"> · {hiddenNearDuplicates} near-duplicate{hiddenNearDuplicates === 1 ? '' : 's'} hidden</span>
                  )}
                  {multiTabInfo && (
                    <span className="mbd:text-(--ink-3)">
                      {' · '}{multiTabInfo.scanned} tab{multiTabInfo.scanned === 1 ? '' : 's'}
                      {multiTabInfo.skipped > 0 ? ` · ${multiTabInfo.skipped} skipped` : ''}
                    </span>
                  )}
                </>
              )}
            </p>
            )}
          </div>
          {pendingVideoCount > 0 && (
            <button
              onClick={() => void handleFetchAllVideos()}
              disabled={fetchingVideos}
              className="btn btn-ghost mbd:flex-none"
              title="Fetch every pending video's real file over the network"
            >
              <VideoCameraIcon className={`mbd:h-4 mbd:w-4 ${fetchingVideos ? 'mbd:animate-pulse' : ''}`} />
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
        <Settings
          onClose={() => setShowSettings(false)}
          onSettingsChange={handleSettingsChange}
          settings={settings}
          perHost={{
            host: perHost.host,
            hasOverride: perHost.hasOverride,
            onSaveForSite: perHost.saveForThisSite,
            onResetSite: perHost.resetThisSite,
          }}
        />
      )}

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}

      {showFavourites && <FavouritesPanel onClose={() => setShowFavourites(false)} />}

      {showExcluded && <ExcludedPanel onClose={() => setShowExcluded(false)} />}

      {showTabPicker && (
        <TabPickerPanel
          onClose={() => setShowTabPicker(false)}
          initialSelected={selectedTabIds}
          onConfirm={(ids) => {
            setShowTabPicker(false);
            changeScope('selected', ids);
          }}
        />
      )}
    </div>
  );
};

export default App;
