import type { Store } from './kv.ts';

export interface DesktopSettings {
  downloadPath: string;
  namingMode: 'prefixed' | 'original';
  fileNamePrefix: string;
  downloadConcurrency: number;
  skipDuplicateDownloads: boolean;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  downloadPath: '',
  namingMode: 'prefixed',
  fileNamePrefix: 'image_',
  downloadConcurrency: 5,
  skipDuplicateDownloads: true,
};

export async function loadSettings(store: Store): Promise<DesktopSettings> {
  const saved = await store.durableGet<Partial<DesktopSettings>>('settings');
  return { ...DEFAULT_DESKTOP_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(store: Store, s: DesktopSettings): Promise<void> {
  await store.durableSet('settings', s);
}
