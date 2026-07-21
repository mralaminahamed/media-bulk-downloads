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
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
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
  const [scope, setScope] = useState<CollectScope>('active');
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [showTabPicker, setShowTabPicker] = useState(false);
  const [multiTabInfo, setMultiTabInfo] = useState<{ scanned: number; skipped: number } | null>(null);
  const [tabScanProgress, setTabScanProgress] = useState<{ done: number; total: number } | null>(null);
  const scopeRef = useRef<CollectScope>(scope);
  const selectedTabIdsRef = useRef<number[]>(selectedTabIds);
  const [streamRefusal, setStreamRefusal] = useState<StreamRefusal | null>(null);
  const { selectedSrcs, setSelectedSrcs, handleToggleSelect, handleSelectRange, handleSelectAllShown, handleClearSelection } = useSelection();

  const currentSourcePage = async (): Promise<{ url: string; title?: string }> => {
    if (surface === 'bubble') return { url: location.href, title: document.title };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { url: tab?.url ?? '', title: tab?.title };
  };

  const { favouriteSrcs, handleToggleFavourite } = useFavourites(currentSourcePage);

  const { settings, handleSettingsChange } = useSettings();
  const perHost = usePerHostSettings(currentSourcePage, settings);

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
    if (surface !== 'popup') return;
    document.body.style.width = `${settings.popupWidth}px`;
    document.body.style.height = `${settings.popupHeight}px`;
  }, [surface, settings.popupWidth, settings.popupHeight]);

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
    handleCaptureStream,
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

  const availableFilterOptions = useMemo(() => deriveFilterOptions(state.images), [state.images]);

  const total = state.images.length;
  const shown = state.filteredImages.length;
  const downloadableShown = downloadable(state.filteredImages).length;
  const pendingVids = pendingVideos(state.filteredImages);
  const pendingVideoCount = pendingVids.length;
  const fetchingVideos = fetchingAllVideos;
  const hasImages = total > 0;
  const filtered = shown !== total;
  const nearDuplicateCount = useMemo(() => state.images.reduce((n, i) => n + (i.nearDuplicate ? 1 : 0), 0), [state.images]);
  const pendingResolveCount = useMemo(
    () => state.images.reduce((n, i) => n + (i.unresolvedVideo || i.unresolvedImage ? 1 : 0), 0),
    [state.images],
  );
  const hiddenNearDuplicates = useMemo(() => {
    if (nearDuplicateCount === 0) return 0;
    const shownSrcs = new Set(state.filteredImages.map((i) => i.src));
    return state.images.reduce((n, i) => n + (i.nearDuplicate && !shownSrcs.has(i.src) ? 1 : 0), 0);
  }, [state.images, state.filteredImages, nearDuplicateCount]);
  const selectedCount = selectedSrcs.size;
  const allShownSelected = downloadableShown > 0 && selectedCount === downloadableShown;

  return (
    <div className="mbd-app mbd:flex mbd:h-full mbd:flex-col mbd:overflow-hidden mbd:bg-(--paper) mbd:text-(--ink)">
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
            <a
              href="https://alaminahamed.com/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="donatebtn"
              title="Support the project — donate"
              aria-label="Support the project — donate"
            >
              <HeartSolidIcon className="mbd:h-4.5 mbd:w-4.5" />
            </a>
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
                  if (next === 'selected') { setShowTabPicker(true); return; }
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

      {hasImages && !state.isLoading && (
        <FilterToolbar onFilterChange={handleFilterChange} extensionSettings={perHost.effective} available={availableFilterOptions} initialFilters={filterSeed} nearDuplicateCount={nearDuplicateCount} pendingCount={pendingResolveCount} />
      )}

      <main className="scroll-thin mbd:flex-1 mbd:overflow-y-auto mbd:px-4 mbd:py-3">
        {state.isLoading ? (
          <SkeletonGrid thumbnailSize={settings.thumbnailSize} />
        ) : total === 0 ? (
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
            onCaptureStream={handleCaptureStream}
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

      <SaveAsPromptHint surface={surface} />

      <DownloadQueue />

      {streamRefusal && (
        <StreamHandoff key={`${streamRefusal.item.src}:${streamRefusal.code}`} refusal={streamRefusal} onDismiss={() => setStreamRefusal(null)} />
      )}

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
