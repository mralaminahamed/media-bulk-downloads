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

export interface SettingsData {
  downloadPath: string;
  fileNamePrefix: string;
  popupWidth: number;
  popupHeight: number;
  showImageCount: boolean;
  minimumImageSize: number;
  excludeBase64Images: boolean;
  /** Show the on-page floating bubble (in-page app surface). */
  bubbleEnabled: boolean;
  bubblePosition: BubblePosition;
}

export interface FilterOptions {
  imageType: string;
  minSize: number;
  includeBase64: boolean;
}
