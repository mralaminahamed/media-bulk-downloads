export interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
  type: string; // 'jpeg', 'png', 'gif', 'svg', 'webp', 'unknown', etc.
  fileSize: number; // in bytes
  isBase64: boolean;
  fromSrcset?: boolean;
}

export interface DownloadMessage {
  type: 'DOWNLOAD_IMAGES';
  images: ImageInfo[];
}

export interface DownloadResponse {
  status: 'success' | 'error';
  message: string;
}

export type GetImagesMessage = 'GET_IMAGES';

/** Sent to the content script to toggle the on-page bubble open/closed. */
export type ToggleBubbleMessage = 'TOGGLE_BUBBLE';

export type ChromeMessage = DownloadMessage | GetImagesMessage | ToggleBubbleMessage;

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
}

export interface FilterOptions {
  imageType: string;
  minSize: number;
  includeBase64: boolean;
}
