export interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
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
  isLoading: boolean;
}
