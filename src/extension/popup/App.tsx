import React, { useCallback, useEffect, useRef, useState } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/panels/Settings';
import HistoryPanel from './components/panels/HistoryPanel';
import FavouritesPanel from './components/panels/FavouritesPanel';
import ExcludedPanel from './components/panels/ExcludedPanel';
import FilterToolbar, { DEFAULT_FILTERS } from './components/FilterToolbar';
import { DownloadButton } from './components/DownloadButton';
import { ProgressBar } from './components/ProgressBar';
import { DownloadQueue } from './components/DownloadQueue';
import { SelectCheckbox } from './components/fields/SelectCheckbox';
import { BrandMark } from '../components/BrandMark';
import { SkeletonGrid } from './components/states/SkeletonGrid';
import { EmptyState } from './components/states/EmptyState';
import { ErrorState } from './components/states/ErrorState';
import { AppState, AppProps, DeepScanProgress, DeepScanStopReason, DownloadMessage, DownloadResponse, DownloadZipMessage, DownloadBytesMessage, ExcludedKind, FavouriteEntry, FilterOptions, ImageInfo, OriginalCaptureProgress, SettingsData } from '@/types';
import { filterImagesBySettings, applyToolbarFilters, filterExcluded, ExcludedMatchers } from '../shared/collection/filters';
import { SrcKeySet, canonicalSrcKey } from '../shared/collection/canonical';
import { DEFAULT_SETTINGS, withDefaults } from '../shared/storage/settings';
import { collectFromActiveTab } from '../shared/active-tab/collect-active-tab';
import { deepScanActiveTab, abortDeepScanActiveTab } from '../shared/active-tab/deep-scan-active-tab';
import { requestResolveOriginals } from '../shared/active-tab/resolve-originals-active';
import { applyResolved } from './apply-resolved';
import { HISTORY_KEY } from '../shared/storage/history';
import { favouriteSrcSet, FAVOURITES_KEY } from '../shared/storage/favourites';
import { excludedMatchers, EXCLUDED_KEY } from '../shared/storage/excluded';
import { buildZip, zipFileName } from '../shared/download/zip';
import { convertImage, isConvertible } from '../shared/download/convert/convert';
import { u8ToBase64 } from '../shared/download/base64';
import { buildDownloadFilename } from '../shared/collection/download-name';
import { hostFromUrl, registrableDomain, todayISO } from '../shared/collection/paths';
import { requestCaptureStream } from '../shared/active-tab/capture-stream-active';
import { copyText, downloadText, fetchDownloadedOnDisk, getImageFileSize, mapWithConcurrency, sendRuntimeMessage } from './utils';
import { Cog6ToothIcon, ArrowPathIcon, ChevronDoubleDownIcon, ClockIcon, XMarkIcon, StarIcon, VideoCameraIcon, NoSymbolIcon, PhotoIcon } from '@heroicons/react/24/outline';

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

/** Items the user can actually download/zip now — pending videos and HLS streams
 *  (which are captured individually, not fetched as one file) are excluded. */
const downloadable = (list: ImageInfo[]): ImageInfo[] =>
  list.filter((i) => !i.unresolvedVideo && !i.hlsManifest);

/** Pending videos that still carry a resolve hint — the set "Get all videos" acts on. */
const pendingVideos = (list: ImageInfo[]): ImageInfo[] =>
  list.filter((i) => i.kind === 'video' && i.unresolvedVideo && !!i.resolveHint);

const App: React.FC<AppProps> = ({
  collect = collectFromActiveTab,
  deepScan = deepScanActiveTab,
  abortDeepScan = abortDeepScanActiveTab,
  captureOriginals,
  abortCaptureOriginals,
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
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState<OriginalCaptureProgress | null>(null);
  const [confirmCapture, setConfirmCapture] = useState(false);
  const [downloadedSrcs, setDownloadedSrcs] = useState<SrcKeySet>(new SrcKeySet());
  const [showFavourites, setShowFavourites] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [favouriteSrcs, setFavouriteSrcs] = useState<SrcKeySet>(new SrcKeySet());
  const [excludedMatch, setExcludedMatch] = useState<ExcludedMatchers>({ urls: new SrcKeySet(), hosts: new Set() });
  const excludedRef = useRef<ExcludedMatchers>({ urls: new SrcKeySet(), hosts: new Set() });
  const [resolveFailedSrcs, setResolveFailedSrcs] = useState<Set<string>>(new Set());
  const [fetchingSrcs, setFetchingSrcs] = useState<Set<string>>(new Set());
  // Whether a batch "Get all videos" run is in flight (distinct from a single
  // per-item "Get video", which only spins that tile — not the batch button).
  const [fetchingAllVideos, setFetchingAllVideos] = useState(false);
  // Selective bulk download: srcs the user has ticked. Scoped to what's shown —
  // pruned whenever the filtered view changes (see the effect below).
  const [selectedSrcs, setSelectedSrcs] = useState<Set<string>>(new Set());
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
    // The "downloaded" mark reflects files still on disk, not just what history
    // records — so an item the user deleted becomes re-downloadable (not a
    // duplicate). chrome.downloads lives in the background, so this asks it, and
    // re-asks whenever history changes (a new download, or a cleared entry).
    const refresh = (): void => void fetchDownloadedOnDisk().then((s) => setDownloadedSrcs(SrcKeySet.from(s)));
    refresh();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[HISTORY_KEY]) refresh();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    void favouriteSrcSet().then(setFavouriteSrcs);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      // Reload through favouriteSrcSet() (which normalizes via loadFavourites and
      // drops corrupt entries) rather than trusting the raw newValue — matches the
      // initial load, the History path, and the excluded path below.
      if (area === 'local' && changes[FAVOURITES_KEY]) void favouriteSrcSet().then(setFavouriteSrcs);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    // Keep settings live while the popup is open. The on-page bubble persists
    // bubbleWidth/height/placement on resize/drag; without this the popup's
    // one-time snapshot would clobber those the next time the user saves Settings.
    // Mirrors the bubble's own sync listener. Registered between the favourites
    // and excluded local listeners so both keep their positional order in tests.
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'sync' || !changes.settings) return;
      const next = withDefaults(changes.settings.newValue as Partial<SettingsData>);
      settingsRef.current = next;
      setSettings(next);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    const load = () => void excludedMatchers().then((m) => { excludedRef.current = m; setExcludedMatch(m); });
    load();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[EXCLUDED_KEY]) load();
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
          filteredImages: applyToolbarFilters(eligible, filtersRef.current),
        };
      });
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
        filteredImages: applyToolbarFilters(eligible, filtersRef.current),
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
      if (s.resolveOriginals) void enrichOriginals(eligible, s.captureHlsStreams);
      void enrichImageSizes(eligible);
    },
    [enrichOriginals, enrichImageSizes],
  );

  const fetchImages = useCallback(async (): Promise<void> => {
    enrichGenRef.current++; // cancel any in-flight enrichment
    resolveGenRef.current++; // cancel any in-flight resolution
    // A rescan unmounts FilterToolbar (isLoading) and it remounts at DEFAULT_FILTERS;
    // reset the ref too so the repopulated grid isn't left silently filtered by the
    // previous run's selection while the toolbar shows "All".
    filtersRef.current = DEFAULT_FILTERS;
    setState((prev) => ({ ...prev, isLoading: true, status: '' }));

    try {
      const imageList = await collect();
      const raw = Array.isArray(imageList) ? imageList : [];
      rawImagesRef.current = raw;
      const s = settingsRef.current; // latest settings, not a stale closure
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
  }, [collect, applyResolution]);

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
      // Merge deep-scan results into the existing set by CANONICAL src key, so a
      // rotating CDN edge host doesn't re-add an image already collected.
      const bySrc = new Map(rawImagesRef.current.map((m) => [canonicalSrcKey(m.src), m]));
      found.forEach((m) => {
        const key = canonicalSrcKey(m.src);
        if (!bySrc.has(key)) bySrc.set(key, m);
      });
      const merged = [...bySrc.values()];
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

  /**
   * Facebook original-capture opens each photo one-by-one on facebook.com — a
   * risk-bearing, rate-limit-prone action — so it's gated behind an inline
   * confirm rather than running the instant the button is clicked. A second
   * click while capturing aborts the in-flight run (mirroring deep scan).
   */
  const handleCaptureOriginals = (): void => {
    if (capturing) {
      abortCaptureOriginals?.();
      return;
    }
    setConfirmCapture(true);
  };

  const runCapture = async (): Promise<void> => {
    setConfirmCapture(false);
    if (!captureOriginals) return;
    setCapturing(true);
    setCaptureProgress(null);
    try {
      const found = await captureOriginals((p) => setCaptureProgress(p));
      // Merge into the existing set by CANONICAL src key, same as deep scan —
      // a captured original replacing/joining a lower-res tile shouldn't duplicate.
      const bySrc = new Map(rawImagesRef.current.map((m) => [canonicalSrcKey(m.src), m]));
      found.forEach((m) => {
        const key = canonicalSrcKey(m.src);
        if (!bySrc.has(key)) bySrc.set(key, m);
      });
      const merged = [...bySrc.values()];
      rawImagesRef.current = merged;
      const eligible = filterExcluded(filterImagesBySettings(merged, settings), excludedRef.current);
      applyResolution(eligible, settings);
    } catch (e) {
      setState((prev) => ({ ...prev, status: e instanceof Error ? e.message : 'capture failed' }));
    } finally {
      setCapturing(false);
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
  const handleToggleSelect = (image: ImageInfo): void => {
    if (image.unresolvedVideo || image.hlsManifest) return; // pending/stream items are captured individually, not bulk-selected
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      if (next.has(image.src)) next.delete(image.src);
      else next.add(image.src);
      return next;
    });
  };

  /** Shift-click: add every downloadable item in the clicked run. */
  const handleSelectRange = (imgs: ImageInfo[]): void => {
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      for (const i of imgs) if (!i.unresolvedVideo && !i.hlsManifest) next.add(i.src);
      return next;
    });
  };

  const handleSelectAllShown = (): void =>
    setSelectedSrcs(new Set(downloadable(state.filteredImages).map((i) => i.src)));

  const handleClearSelection = (): void => setSelectedSrcs(new Set());

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
  }, [state.filteredImages]);

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
      return { ...prev, images, filteredImages: applyToolbarFilters(eligible, filtersRef.current) };
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
      return { ...prev, images, filteredImages: applyToolbarFilters(eligible, filtersRef.current) };
    });
  };

  const handleToggleFavourite = async (image: ImageInfo): Promise<void> => {
    if (favouriteSrcs.has(image.src)) {
      sendRuntimeMessage({ type: 'REMOVE_FAVOURITE', src: image.src });
      setFavouriteSrcs((prev) => prev.withoutSrc(image.src));
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
    sendRuntimeMessage({ type: 'ADD_FAVOURITE', entry });
    setFavouriteSrcs((prev) => prev.withAdded(image.src));
  };

  // Hide excluded media from the grid immediately, before the background's write
  // round-trips back through storage.onChanged (which reconciles to the same
  // state). Mirrors the optimistic favourite update above. A 'url' exclusion is
  // keyed by the src's canonical key; a 'host' exclusion by its registrable domain.
  const applyExcludedOptimistic = (updates: { kind: ExcludedKind; value: string; src: string }[]): void => {
    let urls = excludedRef.current.urls;
    const hosts = new Set(excludedRef.current.hosts);
    for (const u of updates) {
      if (u.kind === 'url') urls = urls.withAdded(u.src);
      else hosts.add(u.value);
    }
    const next = { urls, hosts };
    excludedRef.current = next;
    setExcludedMatch(next);
  };

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

  // The popup owns the form's fields. Persist through the background's single
  // serialized writer (SET_SETTINGS) so a concurrent on-page-bubble drag can't
  // clobber this save. Send a patch WITHOUT the drag-only bubble fields (the
  // button's x/y offset and the freeform panel point, which have no Settings
  // control) so the background's deep-merge preserves them.
  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    const { bubblePosition, bubblePanelPoint, ...rest } = newSettings;
    void bubblePanelPoint; // drag-only; not sent so the stored value is preserved
    sendRuntimeMessage({
      type: 'SET_SETTINGS',
      patch: { ...rest, bubblePosition: { corner: bubblePosition.corner } },
    });
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
            {captureOriginals && settings.fbCaptureOriginals && (
              <>
                {capturing && (
                  <span className="num inline-flex items-center rounded-full bg-(--brand-soft) px-2 py-0.5 text-[10px] font-semibold text-(--brand-ink)">
                    Opened {captureProgress?.opened ?? 0}/{captureProgress?.total ?? 0} · {captureProgress?.captured ?? 0} originals
                  </span>
                )}
                <button
                  onClick={handleCaptureOriginals}
                  className="iconbtn"
                  title={capturing ? 'Stop capturing originals' : 'Fetch full-res originals (Facebook)'}
                  aria-label={capturing ? 'Stop capturing originals' : 'Fetch full-res originals (Facebook)'}
                >
                  <PhotoIcon className={`h-4.5 w-4.5 ${capturing ? 'animate-pulse' : ''}`} />
                </button>
              </>
            )}
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
        {confirmCapture && (
          <div role="dialog" aria-label="Confirm original capture" className="mb-3 rounded-(--radius) border hairline bg-(--panel-2) p-3">
            <p className="text-[13px] text-(--ink)">
              Open up to {settings.fbCaptureMaxPhotos} photos one-by-one to fetch full-res originals
              (~{Math.ceil((settings.fbCaptureMaxPhotos * 3) / 60)} min). Facebook may rate-limit. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void runCapture()} className="btn btn-primary btn-sm">
                Continue
              </button>
              <button type="button" onClick={() => setConfirmCapture(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
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
                onClick={() => (allShownSelected ? handleClearSelection() : handleSelectAllShown())}
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
