export interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
  fileSize: number; // in bytes
  type: string; // 'jpeg', 'png', 'gif', 'svg', 'webp', 'unknown', etc.
  isBase64: boolean;
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

export type ChromeMessage = DownloadMessage | GetImagesMessage;

export interface AppState {
  status: string;
  images: ImageInfo[];
  filteredImages: ImageInfo[];
  isLoading: boolean;
}

export interface SettingsData {
  downloadPath: string;
  fileNamePrefix: string;
  popupWidth: number;
  popupHeight: number;
  showImageCount: boolean;
  minimumImageSize: number;
  excludeBase64Images: boolean;
}

export interface FilterOptions {
  imageType: string;
  minWidth: number;
  minHeight: number;
  maxFileSize: number;
  includeBase64: boolean;
}
