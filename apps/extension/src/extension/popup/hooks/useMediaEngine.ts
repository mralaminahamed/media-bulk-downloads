import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, DeepScanProgress, DeepScanStopReason, FilterOptions, ImageInfo, SettingsData } from '@mbd/core/types';
import { filterImagesBySettings, applyToolbarFilters, filterExcluded, ExcludedMatchers } from '@mbd/core/collection/filters';
import { mergeScannedMedia } from '@mbd/core/collection/merge';
import { loadStoredSettings } from '@mbd/storage/settings';
import { requestResolveOriginals } from '@/extension/shared/active-tab/resolve-originals-active';
import { getPageType } from '@/extension/shared/active-tab/collect-active-tab';
import { applyResolved } from '@/extension/popup/apply-resolved';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { pageDefaults } from '@mbd/core/collection/pageType';
import { DEFAULT_FILTERS } from '@/extension/popup/components/FilterToolbar';
import { getImageFileSize, mapWithConcurrency } from '@/extension/popup/utils';
import { SIZE_FETCH_CONCURRENCY, deepScanCapMessage, pendingVideos } from '@/extension/popup/lib/appHelpers';

export interface UseMediaEngineParams {
  settings: SettingsData;
  settingsRef: RefObject<SettingsData>;
  setSettings?: Dispatch<SetStateAction<SettingsData>>;
  /** Loads the settings that gate the first scan. Defaults to global sync settings; App injects an effective (global + per-host) loader (#293). */
  loadSettings?: () => Promise<SettingsData>;
  excludedRef: RefObject<ExcludedMatchers>;
  excludedMatch: ExcludedMatchers;
  isDownloaded: (item: ImageInfo) => boolean;
  /** Triggers the "Downloaded filter is active" re-derive below on change. */
  downloadedSrcs: SrcKeySet;
  collect: () => Promise<ImageInfo[]>;
  deepScan: (onProgress: (p: DeepScanProgress) => void) => Promise<ImageInfo[]>;
  abortDeepScan: () => void;
}

export interface UseMediaEngineResult {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  deepScanning: boolean;
  deepProgress: DeepScanProgress | null;
  progress: { label: string; done: number; total: number } | null;
  setProgress: Dispatch<SetStateAction<{ label: string; done: number; total: number } | null>>;
  fetchImages: () => Promise<void>;
  handleDeepScan: () => Promise<void>;
  handleFilterChange: (filters: FilterOptions) => void;
  handleFetchVideo: (image: ImageInfo) => Promise<void>;
  handleFetchAllVideos: () => Promise<void>;
  fetchingAllVideos: boolean;
  fetchingSrcs: Set<string>;
  resolveFailedSrcs: Set<string>;
  rawImagesRef: RefObject<ImageInfo[]>;
  filtersRef: RefObject<FilterOptions>;
  /** Page-type-derived filter seed (opt-in `smartPageDefaults`), for FilterToolbar's `initialFilters`. */
  filterSeed: Partial<FilterOptions>;
}

/**
 * The coupled scan/resolution/filter core. Owns `state` (the collected +
 * filtered image sets) and every ref that must stay in sync with it —
 * `rawImagesRef` (the pre-filter set), the enrich/resolve generation guards,
 * and the live toolbar filter (`filtersRef`). Every path that repopulates the
 * grid — the initial scan, a rescan, a settings change, a deep scan, or a
 * video resolution — funnels through `applyResolution` so the same
 * exclude/settings/toolbar-filter gate applies everywhere.
 */
export function useMediaEngine({
  settings,
  settingsRef,
  loadSettings,
  excludedRef,
  excludedMatch,
  isDownloaded,
  downloadedSrcs,
  collect,
  deepScan,
  abortDeepScan,
}: UseMediaEngineParams): UseMediaEngineResult {
  const [state, setState] = useState<AppState>({
    status: '',
    images: [],
    filteredImages: [],
    isLoading: true,
  });
  const [deepScanning, setDeepScanning] = useState(false);
  const [deepProgress, setDeepProgress] = useState<DeepScanProgress | null>(null);

  const deepScanningRef = useRef(false);
  useEffect(() => { deepScanningRef.current = deepScanning; }, [deepScanning]);
  useEffect(() => {
    const onHide = (): void => { if (deepScanningRef.current) abortDeepScan(); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [abortDeepScan]);
  const [filterSeed, setFilterSeed] = useState<Partial<FilterOptions>>({});

  useEffect(() => {
    if (filtersRef.current.downloadState !== 'all') {
      setState((prev) => ({ ...prev, filteredImages: applyToolbarFilters(prev.images, filtersRef.current, isDownloaded) }));
    }
  }, [downloadedSrcs, isDownloaded]);

  const [resolveFailedSrcs, setResolveFailedSrcs] = useState<Set<string>>(new Set());
  const [fetchingSrcs, setFetchingSrcs] = useState<Set<string>>(new Set());
  const [fetchingAllVideos, setFetchingAllVideos] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);

  const rawImagesRef = useRef<ImageInfo[]>([]);
  const enrichGenRef = useRef(0);
  const enrichOriginalsGenRef = useRef(0);
  const resolveGenRef = useRef(0);
  const scanGenRef = useRef(0);
  const filtersRef = useRef<FilterOptions>(DEFAULT_FILTERS);

  useEffect(() => {
    void (loadSettings ?? loadStoredSettings)().then((loaded) => {
      settingsRef.current = loaded;
      void fetchImages();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Lazily fills in remote image byte sizes. Runs only from the popup on the
   * active tab (user-initiated), never from the background badge path.
   */
  const enrichImageSizes = useCallback(async (images: ImageInfo[]): Promise<void> => {
    const generation = ++enrichGenRef.current;
    const targets = images.filter((img) => !img.isBase64 && img.fileSize <= 0 && img.kind === 'image' && !img.unresolvedImage);

    await mapWithConcurrency(targets, SIZE_FETCH_CONCURRENCY, async (img) => {
      const size = await getImageFileSize(img.src);
      if (generation !== enrichGenRef.current || size <= 0) return;

      const apply = (list: ImageInfo[]) =>
        list.map((i) => (i.src === img.src ? { ...i, fileSize: size } : i));

      rawImagesRef.current = apply(rawImagesRef.current);
      setState((prev) => {
        const nextImages = apply(prev.images);
        const eligible = filterExcluded(filterImagesBySettings(nextImages, settingsRef.current), excludedRef.current);
        return {
          ...prev,
          images: nextImages,
          filteredImages: applyToolbarFilters(eligible, filtersRef.current, isDownloaded),
        };
      });
    });
  }, [excludedRef, settingsRef]);

  /**
   * Opt-in resolution over the full eligible set. Pending videos are already
   * displayed (as a poster, via `applyResolution`) — this resolves each item's
   * `resolveHint` via the background and swaps it in place: src becomes the
   * real original and `unresolvedVideo`/`resolveHint` are cleared, upgrading it
   * to a downloadable mp4. Also mirrors the swap into `rawImagesRef` so the
   * upgrade survives a later re-filter (settings change, deep scan). Items that
   * never resolve simply stay pending — nothing flickers in and then disappears.
   */
  const enrichOriginals = useCallback(async (eligible: ImageInfo[], captureHlsStreams: boolean): Promise<void> => {
    const generation = ++enrichOriginalsGenRef.current;
    const targets = eligible.filter((i) => i.resolveHint).map((i) => ({ src: i.src, hint: i.resolveHint! }));
    if (!targets.length) return;
    const resolved = await requestResolveOriginals(targets);
    if (generation !== enrichOriginalsGenRef.current) return;

    const byOldSrc = new Map<string, ImageInfo>();
    for (const i of eligible) {
      const r = i.resolveHint ? resolved[i.src] : undefined;
      if (r) {
        const swapped = applyResolved(i, r, captureHlsStreams);
        if (swapped) byOldSrc.set(i.src, swapped);
      }
    }
    if (!byOldSrc.size) return;
    rawImagesRef.current = rawImagesRef.current.map((m) => byOldSrc.get(m.src) ?? m);

    setState((prev) => {
      const nextImages = prev.images.map((m) => byOldSrc.get(m.src) ?? m);
      const present = new Set(nextImages.map((m) => m.src));
      for (const [oldSrc, item] of byOldSrc) {
        if (!prev.images.some((m) => m.src === oldSrc) && !present.has(item.src)) {
          nextImages.push(item);
          present.add(item.src);
        }
      }
      const eligible = filterExcluded(filterImagesBySettings(nextImages, settingsRef.current), excludedRef.current);
      return {
        ...prev,
        images: nextImages,
        filteredImages: applyToolbarFilters(eligible, filtersRef.current, isDownloaded),
      };
    });
  }, [excludedRef, settingsRef]);

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
      const filtered = applyToolbarFilters(eligible, filtersRef.current, isDownloaded);
      setState((prev) => ({ ...prev, images: eligible, filteredImages: filtered }));
      if (s.resolveOriginals) void enrichOriginals(eligible, s.captureHlsStreams);
      void enrichImageSizes(eligible);
    },
    [enrichOriginals, enrichImageSizes],
  );

  const fetchImages = useCallback(async (): Promise<void> => {
    const scanGeneration = ++scanGenRef.current;
    enrichGenRef.current++;
    enrichOriginalsGenRef.current++;
    resolveGenRef.current++;
    filtersRef.current = DEFAULT_FILTERS;
    setState((prev) => ({ ...prev, isLoading: true, status: '' }));

    try {
      const imageList = await collect();
      if (scanGeneration !== scanGenRef.current) return;
      const raw = Array.isArray(imageList) ? imageList : [];
      rawImagesRef.current = raw;
      const s = settingsRef.current;

      let seed: Partial<FilterOptions> = {};
      if (s.smartPageDefaults) {
        const pt = await getPageType();
        if (scanGeneration !== scanGenRef.current) return;
        seed = pageDefaults(pt);
      }
      setFilterSeed(seed);
      filtersRef.current = { ...DEFAULT_FILTERS, ...seed };

      const eligible = filterExcluded(filterImagesBySettings(raw, s), excludedRef.current);

      setState((prev) => ({ ...prev, status: '', isLoading: false }));
      applyResolution(eligible, s);
    } catch (error) {
      if (scanGeneration !== scanGenRef.current) return;
      const message = error instanceof Error ? error.message : 'unknown error';
      setState((prev) => ({
        ...prev,
        status: `Can't read this page: ${message}`,
        isLoading: false,
      }));
    }
  }, [collect, applyResolution, excludedRef, settingsRef]);

  useEffect(() => {
    if (rawImagesRef.current.length === 0) return;
    const eligible = filterExcluded(filterImagesBySettings(rawImagesRef.current, settings), excludedRef.current);
    applyResolution(eligible, settings);
    // Keyed on the settings fields that affect eligibility + resolution, plus
    // excludedMatch so an exclusion-list change re-derives the grid too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.minimumImageSize, settings.excludeBase64Images, settings.excludeEmoji, settings.resolveOriginals, settings.captureHlsStreams, applyResolution, excludedMatch]);

  const handleDeepScan = async () => {
    if (deepScanning) {
      abortDeepScan();
      return;
    }
    setDeepScanning(true);
    setDeepProgress(null);
    const generation = resolveGenRef.current;
    let stopReason: DeepScanStopReason | undefined;
    try {
      const found = await deepScan((p) => {
        if (p.reason) stopReason = p.reason;
        setDeepProgress(p);
      });
      if (generation !== resolveGenRef.current) return;
      scanGenRef.current++;
      const merged = mergeScannedMedia(rawImagesRef.current, found);
      rawImagesRef.current = merged;
      const latest = settingsRef.current;
      const eligible = filterExcluded(filterImagesBySettings(merged, latest), excludedRef.current);
      applyResolution(eligible, latest);
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
    setState((prev) => ({ ...prev, filteredImages: applyToolbarFilters(prev.images, filters, isDownloaded), status: '' }));
  };

  /**
   * Resolve ONE pending video's real file on demand, regardless of the global
   * resolveOriginals setting (this is an explicit, user-initiated request).
   * On success, swap the item's src to the mp4 (now downloadable); on failure
   * (tombstone / null), mark it failed so the tile can say so.
   */
  const handleFetchVideo = async (image: ImageInfo): Promise<void> => {
    if (!image.resolveHint) return;
    const src = image.src;
    const generation = resolveGenRef.current;
    setFetchingSrcs((p) => new Set(p).add(src));
    setResolveFailedSrcs((p) => { const n = new Set(p); n.delete(src); return n; });
    const resolved = await requestResolveOriginals([{ src, hint: image.resolveHint }]);
    setFetchingSrcs((p) => { const n = new Set(p); n.delete(src); return n; });
    if (generation !== resolveGenRef.current) return;
    const r = resolved[src];
    const swapped = r ? applyResolved(image, r, settingsRef.current.captureHlsStreams) : null;
    if (!swapped) {
      if (!r) setResolveFailedSrcs((p) => new Set(p).add(src));
      return;
    }
    const swap = (list: ImageInfo[]) => list.map((i) => (i.src === src ? swapped : i));
    rawImagesRef.current = swap(rawImagesRef.current);
    setState((prev) => {
      const images = swap(prev.images);
      const eligible = filterExcluded(filterImagesBySettings(images, settingsRef.current), excludedRef.current);
      return { ...prev, images, filteredImages: applyToolbarFilters(eligible, filtersRef.current, isDownloaded) };
    });
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
    const generation = resolveGenRef.current;
    const srcs = targets.map((t) => t.src);
    setFetchingAllVideos(true);
    setFetchingSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.add(s)); return n; });
    setResolveFailedSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.delete(s)); return n; });
    setProgress({ label: 'Fetching videos', done: 0, total: 0 });

    let resolved: Awaited<ReturnType<typeof requestResolveOriginals>>;
    try {
      resolved = await requestResolveOriginals(targets.map((t) => ({ src: t.src, hint: t.resolveHint! })));
    } finally {
      setProgress(null);
      setFetchingAllVideos(false);
      setFetchingSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.delete(s)); return n; });
    }
    if (generation !== resolveGenRef.current) return;
    const failed = srcs.filter((s) => !resolved[s]);
    if (failed.length) setResolveFailedSrcs((p) => { const n = new Set(p); failed.forEach((s) => n.add(s)); return n; });

    const byOldSrc = new Map<string, ImageInfo>();
    for (const t of targets) {
      const r = resolved[t.src];
      const swapped = r ? applyResolved(t, r, settingsRef.current.captureHlsStreams) : null;
      if (swapped) byOldSrc.set(t.src, swapped);
    }
    if (!byOldSrc.size) return;
    const swap = (list: ImageInfo[]) => list.map((i) => byOldSrc.get(i.src) ?? i);
    rawImagesRef.current = swap(rawImagesRef.current);
    setState((prev) => {
      const images = swap(prev.images);
      const eligible = filterExcluded(filterImagesBySettings(images, settingsRef.current), excludedRef.current);
      return { ...prev, images, filteredImages: applyToolbarFilters(eligible, filtersRef.current, isDownloaded) };
    });
  };

  return {
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
  };
}
