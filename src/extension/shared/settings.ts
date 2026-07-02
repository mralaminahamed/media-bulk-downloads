import { SettingsData } from '@/types';

/** Default user settings, shared by the popup, background worker, and bubble. */
export const DEFAULT_SETTINGS: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 460,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
  bubbleEnabled: false,
  bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
};

/** Merge stored settings over defaults, tolerating partial/legacy/unknown shapes. */
export function withDefaults(stored: unknown): SettingsData {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<SettingsData>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    bubblePosition: { ...DEFAULT_SETTINGS.bubblePosition, ...(s.bubblePosition ?? {}) },
  };
}
