import { SettingsData } from '@mbd/core/types';

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
  streamQuality: 'auto',
  downloadConcurrency: 5,
  deepScanMaxItems: 1000,
  deepScanMaxSeconds: 20,
  deepScanMaxScrolls: 40,
  deepScanClickLoadMore: false,
  smartPageDefaults: true,
  rememberScanBehaviour: true,
  skipDuplicateDownloads: true,
  metadataSidecar: false,
};

/** A plain object, or {} — so spreading a corrupt string/array/number legacy
 *  value can't inject junk index keys into a nested settings object. */
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Coerce to a finite integer clamped to [min, max]; NaN / non-numeric / a string
 *  like "many" falls back to `fallback`. Guards fields whose value drives a loop
 *  bound or concurrency cap, where a corrupt (synced or hand-edited/imported)
 *  value would otherwise hang or unbound the affected subsystem. */
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Merge stored settings over defaults, tolerating partial/legacy/unknown shapes. */
export function withDefaults(stored: unknown): SettingsData {
  const s = asObject(stored) as Partial<SettingsData>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    bubblePosition: { ...DEFAULT_SETTINGS.bubblePosition, ...asObject(s.bubblePosition) },
    bubblePanelPoint: { ...DEFAULT_SETTINGS.bubblePanelPoint, ...asObject(s.bubblePanelPoint) },
    // Drives the download-queue concurrency cap (claimNext): 0/negative stalls the
    // queue forever, NaN/"many" removes the cap entirely. Clamp to a sane range.
    downloadConcurrency: clampInt(s.downloadConcurrency, 1, 20, DEFAULT_SETTINGS.downloadConcurrency),
    // Deep-scan loop bounds. A corrupt value (synced from another device/version,
    // or hand-edited into a restored backup) otherwise slips through: negative
    // breaks the scan loop immediately (near-empty result), a non-numeric string
    // makes the `found.size >= max` comparison NaN and removes the cap. Clamp like
    // downloadConcurrency so no scan can be neutered or unbounded by bad input.
    deepScanMaxItems: clampInt(s.deepScanMaxItems, 1, 100_000, DEFAULT_SETTINGS.deepScanMaxItems),
    deepScanMaxSeconds: clampInt(s.deepScanMaxSeconds, 1, 600, DEFAULT_SETTINGS.deepScanMaxSeconds),
    deepScanMaxScrolls: clampInt(s.deepScanMaxScrolls, 1, 10_000, DEFAULT_SETTINGS.deepScanMaxScrolls),
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
