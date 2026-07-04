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
  type: string; // 'jpeg', 'png', 'gif', 'svg', 'webp', 'unknown', etc.
  fileSize: number; // in bytes
  isBase64: boolean;
  fromSrcset?: boolean;
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
export interface DeepScanProgress {
  type: 'DEEP_SCAN_PROGRESS';
  found: number;
  scrolls: number;
  elapsedMs: number;
}

export interface ResolveOriginalsMessage {
  type: 'RESOLVE_ORIGINALS';
  hints: { src: string; hint: ResolveHint }[];
}

export interface ResolveOriginalsResponse {
  resolved: Record<string, string>; // src -> resolvedUrl (successes only)
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

export type ChromeMessage =
  | DownloadMessage
  | GetImagesMessage
  | ToggleBubbleMessage
  | DeepScanMessage
  | DeepScanAbortMessage
  | DeepScanProgress
  | ResolveOriginalsMessage
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
}

export type SizeBucket = 'all' | 'small' | 'medium' | 'large';

export interface FilterOptions {
  /** Primary media-kind filter. */
  mediaKind: 'all' | 'image' | 'video' | 'audio';
  imageType: string;
  minSize: number;
  includeBase64: boolean;
  sizeBucket: SizeBucket;
}
