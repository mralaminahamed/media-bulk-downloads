import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, DeepScanProgress, DeepScanStopReason, FilterOptions, ImageInfo, SettingsData } from '@mbd/core/types';
import { filterImagesBySettings, applyToolbarFilters, filterExcluded, ExcludedMatchers } from '@mbd/core/collection/filters';
import { mergeScannedMedia } from '@mbd/core/collection/merge';
import { loadStoredSettings } from '@mbd/storage/settings';
import { requestResolveOriginals } from '../../shared/active-tab/resolve-originals-active';
import { getPageType } from '../../shared/active-tab/collect-active-tab';
import { applyResolved } from '../apply-resolved';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { pageDefaults } from '@mbd/core/collection/pageType';
import { DEFAULT_FILTERS } from '../components/FilterToolbar';
import { getImageFileSize, mapWithConcurrency } from '../utils';
import { SIZE_FETCH_CONCURRENCY, deepScanCapMessage, pendingVideos } from '../lib/appHelpers';

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
  // Page-type-derived filter seed, surfaced to FilterToolbar as `initialFilters`
  // when `smartPageDefaults` is on; `{}` (today's defaults) otherwise.
  const [filterSeed, setFilterSeed] = useState<Partial<FilterOptions>>({});

  useEffect(() => {
    // When the Downloaded filter is active, a completed download changes which
    // items pass it — re-derive the shown grid from the current image set.
    if (filtersRef.current.downloadState !== 'all') {
      setState((prev) => ({ ...prev, filteredImages: applyToolbarFilters(prev.images, filtersRef.current, isDownloaded) }));
    }
  }, [downloadedSrcs, isDownloaded]);

  const [resolveFailedSrcs, setResolveFailedSrcs] = useState<Set<string>>(new Set());
  const [fetchingSrcs, setFetchingSrcs] = useState<Set<string>>(new Set());
  // Whether a batch "Get all videos" run is in flight (distinct from a single
  // per-item "Get video", which only spins that tile — not the batch button).
  const [fetchingAllVideos, setFetchingAllVideos] = useState(false);
  // Live progress for in-extension batch work (zip fetch, video resolve). null = idle.
  // total 0 → indeterminate.
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);

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

  useEffect(() => {
    // Load the effective settings BEFORE the first scan, so a persisted
    // resolveOriginals / per-host min-size is known when the scan gates on it.
    // The editor's GLOBAL state is seeded separately by useSettings, so the
    // engine no longer calls setSettings here.
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
    // A pending image's `src` is the x.com tweet-page placeholder URL, not a real
    // file — a HEAD/GET against it would fetch the page HTML (wasted request,
    // and violates the opt-in/passive collection constraint). Pending videos are
    // already excluded by `kind === 'image'`, since a pending video is `kind: 'video'`.
    const targets = images.filter((img) => !img.isBase64 && img.fileSize <= 0 && img.kind === 'image' && !img.unresolvedImage);

    await mapWithConcurrency(targets, SIZE_FETCH_CONCURRENCY, async (img) => {
      const size = await getImageFileSize(img.src);
      if (generation !== enrichGenRef.current || size <= 0) return;

      const apply = (list: ImageInfo[]) =>
        list.map((i) => (i.src === img.src ? { ...i, fileSize: size } : i));

      // Mirror the size into the raw set too (like enrichOriginals does), so a later
      // settings-change re-filter re-derives from rawImagesRef WITHOUT wiping the
      // enriched sizes and re-firing a fresh round of HEAD requests.
      rawImagesRef.current = apply(rawImagesRef.current);
      setState((prev) => {
        const nextImages = apply(prev.images);
        // Re-derive the filtered view (not a plain map) so a newly-known size is
        // re-sorted (sort-by-size) and re-gated (Min KB) — otherwise the grid
        // order/visibility disagrees with the sizes it just showed.
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
    const generation = ++resolveGenRef.current;
    const targets = eligible.filter((i) => i.resolveHint).map((i) => ({ src: i.src, hint: i.resolveHint! }));
    if (!targets.length) return;
    const resolved = await requestResolveOriginals(targets);
    if (generation !== resolveGenRef.current) return;

    // oldSrc -> resolved item (hint cleared, src swapped to the real original)
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
      // Derive the filtered view from the new image set so the exclude blocklist,
      // settings gates, AND the active toolbar filter all still apply to upgraded
      // and newly-appended items — a resolved src (e.g. a pending video's mp4)
      // that lands on the blocklist or fails a settings gate must not surface.
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
      // Preserve the active toolbar filter when repopulating the grid.
      const filtered = applyToolbarFilters(eligible, filtersRef.current, isDownloaded);
      setState((prev) => ({ ...prev, images: eligible, filteredImages: filtered }));
      if (s.resolveOriginals) void enrichOriginals(eligible, s.captureHlsStreams);
      void enrichImageSizes(eligible);
    },
    [enrichOriginals, enrichImageSizes],
  );

  const fetchImages = useCallback(async (): Promise<void> => {
    enrichGenRef.current++; // cancel any in-flight enrichment
    resolveGenRef.current++; // cancel any in-flight resolution
    // A rescan unmounts FilterToolbar (isLoading) and it remounts at DEFAULT_FILTERS
    // merged with the current seed below; reset the ref too so the repopulated
    // grid isn't left silently filtered by the previous run's selection while the
    // toolbar shows "All"/the seed.
    filtersRef.current = DEFAULT_FILTERS;
    setState((prev) => ({ ...prev, isLoading: true, status: '' }));

    try {
      const imageList = await collect();
      const raw = Array.isArray(imageList) ? imageList : [];
      rawImagesRef.current = raw;
      const s = settingsRef.current; // latest settings, not a stale closure

      // Opt-in: prime the toolbar's defaults from a passive page-type read (no
      // network — DOM signals only). Off by default so behavior is unchanged
      // unless the user turns it on in Settings.
      let seed: Partial<FilterOptions> = {};
      if (s.smartPageDefaults) {
        const pt = await getPageType();
        seed = pageDefaults(pt);
      }
      setFilterSeed(seed);
      filtersRef.current = { ...DEFAULT_FILTERS, ...seed };

      const eligible = filterExcluded(filterImagesBySettings(raw, s), excludedRef.current);

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
  }, [collect, applyResolution, excludedRef, settingsRef]);

  // Re-derive the eligible base list when the settings that affect it change.
  // Also applies opt-in resolution when it loads/changes (settings load async on
  // mount, so the first scan runs before a persisted resolveOriginals is known).
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
    // The final progress event carries why the scan stopped; capture it as it streams.
    let stopReason: DeepScanStopReason | undefined;
    try {
      const found = await deepScan((p) => {
        if (p.reason) stopReason = p.reason;
        setDeepProgress(p);
      });
      // Merge deep-scan results into the collected set: a resolver identity
      // (mediaKey) upgrade-replaces its prior rendition (a Facebook grid tile ->
      // the sniffed original), while a rotating-CDN canonical repeat keeps the
      // first occurrence. Behaviorally identical to the old canonical-only merge
      // until a resolver sets mediaKey (Task 8).
      const merged = mergeScannedMedia(rawImagesRef.current, found);
      rawImagesRef.current = merged;
      const eligible = filterExcluded(filterImagesBySettings(merged, settings), excludedRef.current);
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
    setFetchingSrcs((p) => new Set(p).add(src));
    setResolveFailedSrcs((p) => { const n = new Set(p); n.delete(src); return n; });
    const resolved = await requestResolveOriginals([{ src, hint: image.resolveHint }]);
    setFetchingSrcs((p) => { const n = new Set(p); n.delete(src); return n; });
    const r = resolved[src];
    const swapped = r ? applyResolved(image, r, settings.captureHlsStreams) : null;
    if (!swapped) {
      // A null result is either no-resolution or an HLS-only video with capture
      // off. Only mark a hard failure when nothing resolved; a gated HLS item
      // stays quietly pending (turning on stream capture resolves it next time).
      if (!r) setResolveFailedSrcs((p) => new Set(p).add(src));
      return;
    }
    const swap = (list: ImageInfo[]) => list.map((i) => (i.src === src ? swapped : i));
    // Mirror into the raw set too, so a later settings-change re-filter doesn't
    // revert this item back to a pending tile.
    rawImagesRef.current = swap(rawImagesRef.current);
    // Re-derive the filtered view (not an in-place swap) so the resolved item is
    // re-sorted + re-gated by the active toolbar filter — matching the auto
    // resolveOriginals path (enrichOriginals). An in-place swap left the item in
    // its old poster-name sort slot, out of order with the active sort.
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
    const srcs = targets.map((t) => t.src);
    setFetchingAllVideos(true);
    setFetchingSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.add(s)); return n; });
    setResolveFailedSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.delete(s)); return n; });
    // Indeterminate — the resolve happens in one background batch with no per-item signal.
    setProgress({ label: 'Fetching videos', done: 0, total: 0 });

    let resolved: Awaited<ReturnType<typeof requestResolveOriginals>>;
    try {
      resolved = await requestResolveOriginals(targets.map((t) => ({ src: t.src, hint: t.resolveHint! })));
    } finally {
      // Always clear the in-flight UI — even if the resolve throws — so the batch
      // button and the per-item spinners never stick.
      setProgress(null);
      setFetchingAllVideos(false);
      setFetchingSrcs((p) => { const n = new Set(p); srcs.forEach((s) => n.delete(s)); return n; });
    }
    // Keyed on the raw resolver result: only truly-unresolved items are failures.
    // A gated HLS-only item (resolved, but capture off → applyResolved returns
    // null below) is NOT a failure — it stays quietly pending, same as the single
    // handleFetchVideo path.
    const failed = srcs.filter((s) => !resolved[s]);
    if (failed.length) setResolveFailedSrcs((p) => { const n = new Set(p); failed.forEach((s) => n.add(s)); return n; });

    const byOldSrc = new Map<string, ImageInfo>();
    for (const t of targets) {
      const r = resolved[t.src];
      const swapped = r ? applyResolved(t, r, settings.captureHlsStreams) : null;
      if (swapped) byOldSrc.set(t.src, swapped);
    }
    if (!byOldSrc.size) return;
    const swap = (list: ImageInfo[]) => list.map((i) => byOldSrc.get(i.src) ?? i);
    rawImagesRef.current = swap(rawImagesRef.current);
    // Re-derive the filtered view so every swapped video is re-sorted + re-gated
    // by the active toolbar filter, matching the auto resolveOriginals path.
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
