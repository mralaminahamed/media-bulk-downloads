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
  excludeEmoji: false,
  saveAs: false,
  notifyOnComplete: false,
  convertImagesTo: 'off',
  convertMetadata: 'preserve',
  namingMode: 'prefixed',
  thumbnailSize: 120,
  previewSize: 360,
  bubbleEnabled: false,
  bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
  bubbleWidth: 440,
  bubbleHeight: 560,
  bubblePanelPlacement: 'anchored',
  bubblePanelPoint: { x: 40, y: 40 },
  resolveOriginals: false,
  captureHlsStreams: false,
  downloadConcurrency: 5,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
  smartPageDefaults: true,
  rememberScanBehaviour: true,
  skipDuplicateDownloads: true,
};

/** A plain object, or {} — so spreading a corrupt string/array/number legacy
 *  value can't inject junk index keys into a nested settings object. */
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Merge stored settings over defaults, tolerating partial/legacy/unknown shapes. */
export function withDefaults(stored: unknown): SettingsData {
  const s = asObject(stored) as Partial<SettingsData>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    bubblePosition: { ...DEFAULT_SETTINGS.bubblePosition, ...asObject(s.bubblePosition) },
    bubblePanelPoint: { ...DEFAULT_SETTINGS.bubblePanelPoint, ...asObject(s.bubblePanelPoint) },
  };
}

/** Read the persisted global settings from sync storage, merged over defaults.
 *  Promise-WRAPS the callback form of storage.sync.get (not the promise form):
 *  production-correct under MV3, and compatible with the test suite's callback
 *  mocks. Tolerant of an unset key (→ DEFAULT_SETTINGS). Shared by the popup
 *  mount load, the media engine's default loader, and the per-host effective
 *  resolver, so all read the global layer identically. */
export function loadStoredSettings(): Promise<SettingsData> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], (r) => resolve(withDefaults((r as { settings?: unknown })?.settings)));
  });
}
