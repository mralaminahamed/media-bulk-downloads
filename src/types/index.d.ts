import type { ReactNode, ChangeEvent, FocusEvent, CSSProperties, HTMLAttributes } from 'react';

export type ResolvePlatform = 'twitter' | 'wallhaven' | 'unsplash';
export interface ResolveHint {
  platform: ResolvePlatform;
  id: string; // statusId | wallpaper id | photo shortid
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
}

/** Preferred name for a collected media item (image, video, or audio). */
export type MediaItem = ImageInfo;

export interface DownloadMessage {
  type: 'DOWNLOAD_IMAGES';
  images: ImageInfo[];
  sourcePage?: { url: string; title?: string };
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

/** A portable data backup: user settings + favourites + download history. */
export interface BackupData {
  /** Fixed tag identifying the file as a Media Bulk Downloads backup. */
  app: 'media-bulk-downloads';
  version: number;
  exportedAt: string;
  settings: SettingsData;
  favourites: FavouriteEntry[];
  history: HistoryEntry[];
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
  resolved: Record<string, string>; // src -> resolvedUrl (successes only)
}

/** Content → background: mp4 URLs the page's own API responses exposed, per tab.
 *  Each pair is `[mediaId, mp4Url]`; the background host-pins + stores them. */
export interface XMediaSeenMessage {
  type: 'X_MEDIA_SEEN';
  pairs: [string, string][];
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
  bytes: Uint8Array;
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
 * Replace the stored favourites and download history from an imported backup.
 * Routed through the background so the write lands in the single-writer realm.
 */
export interface RestoreDataMessage {
  type: 'RESTORE_DATA';
  favourites: FavouriteEntry[];
  history: HistoryEntry[];
}

export type ChromeMessage =
  | DownloadMessage
  | DownloadZipMessage
  | DownloadTextMessage
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
  | OpenUrlMessage
  | ClearHistoryMessage
  | RemoveHistoryMessage
  | AddFavouriteMessage
  | RemoveFavouriteMessage
  | ClearFavouritesMessage;

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
  /** Show Chrome's native "Save As" dialog per download (user picks a location). */
  saveAs: boolean;
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
  /** Free-text query matched against filename, alt, type, and URL. Empty = off. */
  search: string;
  /** Sort key + direction applied after filtering. */
  sortBy: SortKey;
  sortDir: SortDir;
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
  /** Set of image srcs already downloaded; renders a ✓ badge on matching tiles. */
  downloadedSrcs?: Set<string>;
  /** Set of srcs already favourited; renders a ★ badge + fills the star toggle. */
  favouriteSrcs?: Set<string>;
  /** Toggle an item's favourite state (add if absent, remove if present). */
  onToggleFavourite?: (image: ImageInfo) => void;
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

export interface SectionProps {
  title: string;
  children: ReactNode;
}
