import type { Store } from './kv.ts';

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
  nearDuplicateThreshold: number;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  downloadPath: '{domain}',
  namingMode: 'prefixed',
  fileNamePrefix: 'image_',
  downloadConcurrency: 5,
  skipDuplicateDownloads: true,
  metadataSidecar: false,
  minimumImageSize: 0,
  excludeBase64Images: false,
  excludeEmoji: false,
  thumbnailSize: 150,
  previewSize: 640,
  smartPageDefaults: false,
  rememberScanBehaviour: false,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 120,
  deepScanMaxScrolls: 200,
  nearDuplicateThreshold: 8,
};

export async function loadSettings(store: Store): Promise<DesktopSettings> {
  const saved = await store.durableGet<Partial<DesktopSettings>>('settings');
  return { ...DEFAULT_DESKTOP_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(store: Store, s: DesktopSettings): Promise<void> {
  await store.durableSet('settings', s);
}
