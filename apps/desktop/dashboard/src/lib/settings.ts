export interface DesktopSettings {
  // Downloads
  downloadPath: string;
  namingMode: 'original' | 'prefixed';
  fileNamePrefix: string;
  downloadConcurrency: number;
  skipDuplicateDownloads: boolean;
  metadataSidecar: boolean;
  // Media (collection filters)
  minimumImageSize: number;
  excludeBase64Images: boolean;
  excludeEmoji: boolean;
  // Display
  thumbnailSize: number;
  previewSize: number;
  // Advanced
  smartPageDefaults: boolean;
  rememberScanBehaviour: boolean;
  deepScanMaxItems: number;
  deepScanMaxSeconds: number;
  deepScanMaxScrolls: number;
  deepScanClickLoadMore: boolean;
  nearDuplicateThreshold: number;
  // Stream capture
  streamQuality: 'auto' | 'best' | 'worst' | '1080' | '720' | '480';
}

export type SettingsPatch = (partial: Partial<DesktopSettings>, debounce?: boolean) => void;
