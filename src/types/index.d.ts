import type React from 'react';
import type { ReactNode, ChangeEvent, FocusEvent, MouseEvent, CSSProperties, HTMLAttributes } from 'react';
import type { SrcKeySet } from '../extension/shared/collection/canonical';

export type ResolvePlatform = 'twitter' | 'wallhaven' | 'unsplash' | 'vimeo' | 'bsky' | 'pinterest' | 'reddit' | 'flickr' | 'artstation' | 'dailymotion';
export interface ResolveHint {
  platform: ResolvePlatform;
  /** Opaque per-platform id: statusId | wallpaper id | photo shortid | for
   *  bsky, a space-delimited `'<blob|video> <did> <cid>'` triple. */
  id: string;
}

/** A resolved media target. `hls` marks `url` as an HLS `.m3u8` master to CAPTURE
 *  (segment-assemble), not a direct file to hand to chrome.downloads. */
export interface ResolvedMedia {
  url: string;
  hls?: boolean;
}

export interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
  type: string; // 'jpeg', 'png', 'gif', 'svg', 'webp', 'unknown', etc. — canonical, for filtering
  /** True file extension for the download name, supplied by the resolver that
   *  built `src` (e.g. Wallhaven 'jpg'/'png', Twitter format). Preferred over the
   *  type-derived extension; falls back to it when absent. */
  ext?: string;
  fileSize: number; // in bytes
  isBase64: boolean;
  /** Small/fast variant to preview in the grid when `src` was upgraded to the original. */
  thumbnailSrc?: string;
  /** Which media kind this is; set by the collector from the source element. */
  kind: 'image' | 'video' | 'audio';
  /** Video poster URL, used as the grid thumbnail when present. */
  poster?: string;
  /** Present when an opt-in network fetch can upgrade this item to a better original. */
  resolveHint?: ResolveHint;
  /** Twitter real video: poster is shown but the item is NOT downloadable until resolved. */
  unresolvedVideo?: boolean;
  /** Twitter pending image (from an unpainted /status/photo cell): NOT downloadable
   *  until the syndication resolve swaps in the real pbs.twimg.com URL. */
  unresolvedImage?: boolean;
  /** HLS stream: the `.m3u8` manifest URL. Present items are captured (fetch +
   *  assemble segments) rather than downloaded as a single file; `src` holds the
   *  manifest URL too, but it must never be handed to chrome.downloads directly. */
  hlsManifest?: string;
  /** Stable cross-rendition identity from the resolver (e.g. `fb:<fbid>`), so a
   *  deep-scan that re-resolves a grid tile to its sniffed original replaces the
   *  thumbnail row rather than duplicating it. */
  mediaKey?: string;
}

/** Preferred name for a collected media item (image, video, or audio). */
export type MediaItem = ImageInfo;

export interface DownloadMessage {
  type: 'DOWNLOAD_IMAGES';
  images: ImageInfo[];
  sourcePage?: { url: string; title?: string };
  /** An explicit, user-picked re-download of specific items (e.g. from the
   *  Favourites/History panels). Bypasses the collection size/base64 and exclude
   *  filters — the user chose these exact items, mirroring the context-menu
   *  single download. The grid's own downloads omit it (its items are already
   *  eligible, so re-filtering is a no-op). */
  explicit?: boolean;
}

export interface HistoryEntry {
  src: string;
  filename: string;
  kind: 'image' | 'video' | 'audio';
  type: string;
  thumbnailSrc?: string;
  sourcePageUrl: string;
  sourcePageTitle?: string;
  time: number;
  /** chrome.downloads id — enables "open file" / "reveal in folder". Absent on
   *  entries recorded before this was tracked, and on failed downloads. */
  downloadId?: number;
}

export interface FavouriteEntry {
  src: string;
  kind: 'image' | 'video' | 'audio';
  type: string;
  thumbnailSrc?: string;
  sourcePageUrl: string;
  sourcePageTitle?: string;
  time: number;
}

export type ExcludedKind = 'url' | 'host';
/** One blocklist entry: an exact media URL or a host. */
export interface ExcludedEntry {
  value: string;
  kind: ExcludedKind;
  time: number;
}

/** A portable data backup: user settings + favourites + download history. */
export interface BackupData {
  /** Fixed tag identifying the file as a Media Bulk Downloads backup. */
  app: 'media-bulk-downloads';
  version: number;
  exportedAt: string;
  settings: SettingsData;
  favourites: FavouriteEntry[];
  history: HistoryEntry[];
  excluded: ExcludedEntry[];
}

export interface DownloadResponse {
  status: 'success' | 'error';
  message: string;
}

export type GetImagesMessage = 'GET_IMAGES';

/** Sent to the content script to toggle the on-page bubble open/closed. */
export type ToggleBubbleMessage = 'TOGGLE_BUBBLE';

/** Sent to the content script to start a deep scan of the page. */
export type DeepScanMessage = 'DEEP_SCAN';

/** Sent to the content script to abort an in-progress deep scan. */
export type DeepScanAbortMessage = 'DEEP_SCAN_ABORT';

/** Broadcast by the content script while a deep scan is running. */
/**
 * Why a deep scan ended. `complete` = ran dry naturally (idle rounds or bottom
 * reached); the `max-*` values mean a documented cap stopped it early, so media
 * may remain; `aborted` = the user stopped it.
 */
export type DeepScanStopReason = 'complete' | 'max-items' | 'max-time' | 'max-scrolls' | 'aborted' | 'error';

export interface DeepScanProgress {
  type: 'DEEP_SCAN_PROGRESS';
  found: number;
  scrolls: number;
  elapsedMs: number;
  /** Present only on the final progress event — why the scan ended. */
  reason?: DeepScanStopReason;
}

export interface ResolveOriginalsMessage {
  type: 'RESOLVE_ORIGINALS';
  hints: { src: string; hint: ResolveHint }[];
}

export interface ResolveOriginalsResponse {
  resolved: Record<string, ResolvedMedia>; // src -> resolved media (successes only)
}

/** Content → background: mp4/HLS URLs the page's own API responses exposed, per tab.
 *  Each pair is `[mediaId, ResolvedMedia]`; the background re-pins + stores them. */
export interface XMediaSeenMessage {
  type: 'X_MEDIA_SEEN';
  pairs: [string, ResolvedMedia][];
}

/** Open a downloaded file in the OS default app (chrome.downloads.open). */
export interface OpenDownloadMessage {
  type: 'OPEN_DOWNLOAD_FILE';
  downloadId: number;
}

/** Reveal a downloaded file in the OS file manager (chrome.downloads.show). */
export interface ShowDownloadMessage {
  type: 'SHOW_DOWNLOAD';
  downloadId: number;
}

/** Ask the background for the srcs already downloaded whose file still exists on
 *  disk. Routed here because `chrome.downloads` is unavailable to the content
 *  script (bubble). Response is a `string[]` of srcs. */
export interface GetDownloadedSrcsMessage {
  type: 'GET_DOWNLOADED_SRCS';
}

/** Open a URL in a new browser tab (chrome.tabs.create). */
export interface OpenUrlMessage {
  type: 'OPEN_URL';
  url: string;
}

/** Clear the whole download history. Routed through the background so all
 *  history writes happen in one realm (no cross-context clobber). */
export interface ClearHistoryMessage {
  type: 'CLEAR_HISTORY';
}

/** Remove one history entry by src. Routed through the background (see above). */
export interface RemoveHistoryMessage {
  type: 'REMOVE_HISTORY_ENTRY';
  src: string;
}

/** Add one item to Favourites. Routed through the background (single writer). */
export interface AddFavouriteMessage {
  type: 'ADD_FAVOURITE';
  entry: FavouriteEntry;
}

/** Remove one favourite by src. Routed through the background. */
export interface RemoveFavouriteMessage {
  type: 'REMOVE_FAVOURITE';
  src: string;
}

/** Clear all favourites. Routed through the background. */
export interface ClearFavouritesMessage {
  type: 'CLEAR_FAVOURITES';
}

/** Add one blocklist entry. Routed through the background (single writer). */
export interface AddExcludedMessage { type: 'ADD_EXCLUDED'; entry: ExcludedEntry }
/** Remove one blocklist entry by kind+value. */
export interface RemoveExcludedMessage { type: 'REMOVE_EXCLUDED'; kind: ExcludedKind; value: string }
/** Clear the whole blocklist. */
export interface ClearExcludedMessage { type: 'CLEAR_EXCLUDED' }

/**
 * Download a pre-built ZIP archive. The archive is fetched + zipped in the
 * popup/bubble (which can fetch cross-origin and hold the bytes); the background
 * turns the bytes into a `data:` URL and hands them to chrome.downloads — the
 * service worker itself has no `URL.createObjectURL`. Routing through the
 * background also lets the on-page bubble (a content script, no downloads API)
 * use the same path, and survives the popup closing after it dispatches.
 */
export interface DownloadZipMessage {
  type: 'DOWNLOAD_ZIP';
  /** Base64 of the archive bytes. Sent as a string, not a Uint8Array: Chrome
   *  JSON-serializes runtime messages, which turns a typed array into a plain
   *  indexed object (losing .length) — a base64 string always round-trips. */
  b64: string;
  filename: string;
}

/**
 * Save a text payload (a URL list, or a JSON data backup) as a file. Routed
 * through the background so it works from both the popup and the on-page bubble
 * (a content script, which has no chrome.downloads); the background encodes it
 * as a `data:` URL. Fire-and-forget.
 */
export interface DownloadTextMessage {
  type: 'DOWNLOAD_TEXT';
  filename: string;
  text: string;
  mime: string;
}

/**
 * Save arbitrary bytes (a canvas-converted image) as a file. Like DOWNLOAD_ZIP
 * but with a caller-supplied mime — the background encodes a `data:` URL so it
 * works from the popup and the bubble. Fire-and-forget.
 */
export interface DownloadBytesMessage {
  type: 'DOWNLOAD_BYTES';
  filename: string;
  /** Base64 of the file bytes — a string so it survives Chrome's JSON message
   *  serialization (a Uint8Array would arrive as an indexed object). */
  b64: string;
  mime: string;
  /** Original media identity so a converted image is recorded to history (the
   *  "already downloaded" mark + dedup) like a plain download. Absent → not
   *  recorded. */
  source?: {
    src: string;
    kind: ImageInfo['kind'];
    type: string;
    thumbnailSrc?: string;
    sourcePageUrl: string;
    sourcePageTitle?: string;
  };
}

/**
 * Replace the stored favourites and download history from an imported backup.
 * Routed through the background so the write lands in the single-writer realm.
 */
export interface RestoreDataMessage {
  type: 'RESTORE_DATA';
  favourites: FavouriteEntry[];
  history: HistoryEntry[];
  excluded: ExcludedEntry[];
}

/** Popup → background: capture this stream. Background owns the offscreen doc,
 *  the download, and the status, so it needs the item + source page for the
 *  filename — it must not depend on the popup after this message. */
export interface CaptureStreamMessage {
  type: 'CAPTURE_STREAM';
  /** Caller-owned unique id scoping this capture's progress across contexts, so
   *  concurrent captures (e.g. two tabs) never cross-route their progress. */
  runId: string;
  item: ImageInfo;
  sourcePage: { url: string; title?: string };
}

/** Background → offscreen: run the engine with this capture policy. */
export interface CaptureRunMessage {
  type: 'CAPTURE_RUN';
  /** Echoed back on each CAPTURE_PROGRESS so the background/caller can route it. */
  runId: string;
  manifestUrl: string;
  /** Which engine the offscreen host runs. */
  engine: 'hls' | 'dash';
  quality: number;
  maxBytes: number;
}

/** Offscreen → all contexts (the popup listens): capture progress. */
export interface CaptureProgressMessage {
  type: 'CAPTURE_PROGRESS';
  /** Which capture this progress belongs to (see CaptureStreamMessage.runId). */
  runId: string;
  done: number;
  total: number;
}

/** Offscreen → background: the capture outcome. On success the blob URL is
 *  same-extension origin, read by the background's chrome.downloads. */
export type CaptureRunResult =
  | { ok: true; blobUrl: string; ext: string; segmentCount: number; muxedAudio: boolean }
  | { ok: false; code: string };

/** Background → popup: the fully-composed status line for a capture. */
export interface CaptureStreamResponse {
  status: string;
}

/**
 * Persist a settings patch through the background's single serialized writer.
 * Both the popup and the on-page bubble write settings; routing them through one
 * ordered writer (instead of each doing a bare storage.sync get→set) stops a
 * concurrent write from clobbering the other's fields. The two nested objects the
 * bubble drags (bubblePosition, bubblePanelPoint) are deep-merged, so a partial
 * patch (e.g. only the corner) preserves the drag-set x/y.
 */
export interface SetSettingsMessage {
  type: 'SET_SETTINGS';
  patch: Partial<Omit<SettingsData, 'bubblePosition' | 'bubblePanelPoint'>> & {
    bubblePosition?: Partial<BubblePosition>;
    bubblePanelPoint?: SettingsData['bubblePanelPoint'];
  };
}

export type QueuePauseMessage = { type: 'QUEUE_PAUSE' };
export type QueueResumeMessage = { type: 'QUEUE_RESUME' };
export interface QueueCancelMessage {
  type: 'QUEUE_CANCEL';
  /** Omit to cancel all still-live (queued/active) items. */
  id?: string;
}
export interface QueueRetryMessage {
  type: 'QUEUE_RETRY';
  id: string;
  /** Retry with the Referer/Origin rewrite (hotlink 403 opt-in, #197). Requires
   *  the popup to have obtained the optional declarativeNetRequestWithHostAccess permission. */
  referer?: boolean;
}
export type QueueGetMessage = { type: 'QUEUE_GET' };

/** Clear all finished (done/failed) queue items. Routed through the background
 *  (single writer for the queue). */
export type QueueClearMessage = { type: 'QUEUE_CLEAR' };

/** Open a done queue item's downloaded file (chrome.downloads.open). */
export interface QueueOpenMessage {
  type: 'QUEUE_OPEN';
  id: string;
}

export type ChromeMessage =
  | DownloadMessage
  | SetSettingsMessage
  | QueuePauseMessage
  | QueueResumeMessage
  | QueueCancelMessage
  | QueueRetryMessage
  | QueueGetMessage
  | QueueClearMessage
  | QueueOpenMessage
  | DownloadZipMessage
  | DownloadTextMessage
  | DownloadBytesMessage
  | RestoreDataMessage
  | GetImagesMessage
  | ToggleBubbleMessage
  | DeepScanMessage
  | DeepScanAbortMessage
  | DeepScanProgress
  | ResolveOriginalsMessage
  | XMediaSeenMessage
  | OpenDownloadMessage
  | ShowDownloadMessage
  | GetDownloadedSrcsMessage
  | OpenUrlMessage
  | ClearHistoryMessage
  | RemoveHistoryMessage
  | AddFavouriteMessage
  | RemoveFavouriteMessage
  | ClearFavouritesMessage
  | AddExcludedMessage
  | RemoveExcludedMessage
  | ClearExcludedMessage
  | CaptureStreamMessage
  | CaptureProgressMessage;

export interface AppState {
  status: string;
  images: ImageInfo[];
  filteredImages: ImageInfo[];
  isLoading: boolean;
}

export type BubbleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BubblePosition {
  corner: BubbleCorner;
  /** Offset from the chosen corner, in pixels. */
  x: number;
  y: number;
}

/**
 * Where the bubble panel opens, independent of the launcher button:
 * - `anchored` — beside the button, following its corner and position.
 * - `center`   — centered on the viewport, like a modal.
 * - a corner   — pinned to that viewport corner regardless of the button.
 * - `free`     — a custom top-left point set by dragging the panel header.
 */
export type BubblePanelPlacement = 'anchored' | 'center' | 'free' | BubbleCorner;

/** Absolute top-left viewport coordinates for the `free` panel placement. */
export interface BubblePanelPoint {
  x: number;
  y: number;
}

export interface SettingsData {
  downloadPath: string;
  fileNamePrefix: string;
  popupWidth: number;
  popupHeight: number;
  showImageCount: boolean;
  minimumImageSize: number;
  excludeBase64Images: boolean;
  /** Hide emoji graphics (twemoji from Twitter/WordPress/GitHub/etc.). */
  excludeEmoji: boolean;
  /** Show Chrome's native "Save As" dialog per download (user picks a location). */
  saveAs: boolean;
  /** Show a desktop notification when a download batch finishes. Gated behind the
   *  optional `notifications` permission, requested when the user enables it. */
  notifyOnComplete: boolean;
  /** Convert raster images to this format on download. `off` keeps the original
   *  (and the fast direct-URL download path). */
  convertImagesTo: 'off' | 'png' | 'jpeg';
  /** When converting, `preserve` copies the source's EXIF/XMP into the output;
   *  `strip` re-encodes without metadata (the old, now-explicit behaviour). */
  convertMetadata: 'preserve' | 'strip';
  /** How downloaded files are named: from the URL's original name, or a sequential prefix. */
  namingMode: 'original' | 'prefixed';
  /** Fixed thumbnail edge (px) in the image grid; the grid reflows columns. */
  thumbnailSize: number;
  /** Fixed size (px) of the image preview modal / its image box. */
  previewSize: number;
  /** Show the on-page floating bubble (in-page app surface). */
  bubbleEnabled: boolean;
  bubblePosition: BubblePosition;
  bubbleWidth: number;
  bubbleHeight: number;
  /** Where the panel opens relative to the launcher button. */
  bubblePanelPlacement: BubblePanelPlacement;
  /** Custom panel top-left, used when the placement is `free`. */
  bubblePanelPoint: BubblePanelPoint;
  resolveOriginals: boolean;
  /** Surface HLS (`.m3u8`) AND DASH (`.mpd`) streams as capture items (the gate
   *  covers both). Off by default — capturing a stream fetches and assembles every
   *  segment (slow, memory-heavy), so it's an explicit opt-in rather than something
   *  the grid shows unasked. */
  captureHlsStreams: boolean;
  /** Max simultaneous file downloads the queue dispatches (1–10). */
  downloadConcurrency: number;
  /** Deep-scan caps — the scan stops at whichever is reached first. */
  deepScanMaxItems: number;
  deepScanMaxSeconds: number;
  deepScanMaxScrolls: number;
  /** Opt-in: click "Load more"-style buttons between scroll rounds during a deep scan. */
  deepScanClickLoadMore: boolean;
}

export type SizeBucket = 'all' | 'small' | 'medium' | 'large';

/** How the shown grid is ordered. `default` = collection order (no sort). */
export type SortKey = 'default' | 'name' | 'size' | 'dimensions' | 'type';
export type SortDir = 'asc' | 'desc';

export interface FilterOptions {
  /** Primary media-kind filter. */
  mediaKind: 'all' | 'image' | 'video' | 'audio';
  imageType: string;
  minSize: number;
  includeBase64: boolean;
  sizeBucket: SizeBucket;
  /** Filter by whether the item has already been downloaded (per the badge's
   *  history-derived set). 'all' = off. */
  downloadState: 'all' | 'downloaded' | 'not-downloaded';
  /** Free-text query matched against filename, alt, type, and URL. Empty = off. */
  search: string;
  /** Sort key + direction applied after filtering. */
  sortBy: SortKey;
  sortDir: SortDir;
}

/** The filter option lists actually present in a collected set (each includes 'all'). */
export interface AvailableOptions {
  kinds: FilterOptions['mediaKind'][];
  formats: Record<'image' | 'video' | 'audio', string[]>;
  sizeBuckets: SizeBucket[];
}

/** A passive page-type prior derived from cheap DOM signals. */
export type PageType = 'gallery' | 'feed' | 'article' | 'single-media' | 'unknown';

export interface PageSignals {
  imageCount: number;        // count of <img> on the page
  density: number;           // images per viewport-area unit (0..~)
  aspectSpread: number;      // variance of image aspect ratios (grid uniformity → low)
  hasArticle: boolean;       // <article> present OR og:type === 'article'
  dominantAreaRatio: number; // largest image area / total image area (0..1)
  feedMarkers: boolean;      // role="feed" present, or many repeated card structures
}

// ── Component props ──────────────────────────────────────────────────────────
// Central home for the popup React components' props, so each component is one
// file that imports its props from here.

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
  dragHandleProps?: HTMLAttributes<HTMLElement>;
}

export interface ImageListProps {
  images: ImageInfo[];
  onImageDownload: (image: ImageInfo) => void;
  /** Fixed thumbnail edge in px; the grid reflows columns to fit the width. */
  thumbnailSize?: number;
  /** Fixed size (px) of the preview modal and its image box. */
  previewSize?: number;
  /** Canonical-keyed set of already-downloaded srcs; renders a ✓ badge on matching tiles. */
  downloadedSrcs?: SrcKeySet;
  /** Canonical-keyed set of favourited srcs; renders a ★ badge + fills the star toggle. */
  favouriteSrcs?: SrcKeySet;
  /** Toggle an item's favourite state (add if absent, remove if present). */
  onToggleFavourite?: (image: ImageInfo) => void;
  /** Add an item's URL (or its host) to the exclusion list. */
  onExclude?: (image: ImageInfo, kind: ExcludedKind) => void;
  /** Resolve one pending video's real file on demand (per-item "Get video"). */
  onFetchVideo?: (image: ImageInfo) => void;
  /** Srcs whose on-demand resolve returned nothing (tombstone / failure). */
  resolveFailedSrcs?: Set<string>;
  /** Srcs currently being resolved (shows a spinner, disables the button). */
  fetchingSrcs?: Set<string>;
  /** Selected item srcs for selective bulk download (ring + checked box). */
  selectedSrcs?: Set<string>;
  /** True when at least one item is selected — keeps every checkbox visible. */
  selectionActive?: boolean;
  /** Toggle one item's selection (checkbox click without Shift). */
  onToggleSelect?: (image: ImageInfo) => void;
  /** Select a contiguous run of items at once (checkbox Shift-click). */
  onSelectRange?: (images: ImageInfo[]) => void;
}

export interface SettingsProps {
  onClose: () => void;
  onSettingsChange: (newSettings: SettingsData) => void;
  settings: SettingsData;
}

/** Shared props every Settings pane receives from the shell. */
export interface SettingsPaneProps {
  settings: SettingsData;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clampOnBlur: (
    name: keyof SettingsData,
    min: number,
    max?: number,
  ) => (e: React.FocusEvent<HTMLInputElement>) => void;
  toggle: (name: keyof SettingsData) => void;
  setSettings: React.Dispatch<React.SetStateAction<SettingsData>>;
  /** Whether this pane's Advanced section starts expanded (a non-default field lives there). */
  advancedDefaultOpen: boolean;
}

export interface DownloadsPaneProps extends SettingsPaneProps {
  folderPreview: string;
  onNotifyToggle: () => void;
  setNaming: (mode: SettingsData['namingMode']) => void;
}

export interface DataPaneProps {
  onExport: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  backupNote: string;
}

/** Shared props for the small SVG tile icons (play/film/audio). */
export interface IconProps {
  className?: string;
}

export interface LoadingImageProps {
  src: string;
  alt: string;
  className: string;
  style?: CSSProperties;
  lazy?: boolean;
}

export interface SkeletonGridProps {
  thumbnailSize: number;
}

export interface CenteredStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
  tone?: 'neutral' | 'warning';
}

export interface EmptyStateProps {
  onRefresh: () => void;
}

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export interface TextFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hint?: ReactNode;
  hintClassName?: string;
}

export interface NumberFieldProps {
  id: string;
  name: string;
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
}

export interface SelectFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}

export interface ToggleRowProps {
  id: string;
  label: string;
  description?: ReactNode;
  checked: boolean;
  onToggle: () => void;
}

export interface SelectCheckboxProps {
  /** Fully selected — filled box with a check. */
  checked: boolean;
  /** Partial selection — filled box with a dash; reports aria-checked="mixed". */
  indeterminate?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string;
  title?: string;
  /** Positioning / visibility classes from the call site, appended last so they win. */
  className?: string;
}
