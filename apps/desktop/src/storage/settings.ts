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
  deepScanClickLoadMore: boolean;
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
  deepScanClickLoadMore: false,
  nearDuplicateThreshold: 8,
};

const NUMBER_BOUNDS: Partial<Record<keyof DesktopSettings, [number, number]>> = {
  downloadConcurrency: [1, 10],
  nearDuplicateThreshold: [2, 16],
  minimumImageSize: [0, Infinity],
  deepScanMaxItems: [0, Infinity],
  deepScanMaxSeconds: [0, Infinity],
  deepScanMaxScrolls: [0, Infinity],
  thumbnailSize: [1, Infinity],
  previewSize: [1, Infinity],
};

const NAMING_MODES = new Set(['original', 'prefixed']);

function sanitizeSettingValue<K extends keyof DesktopSettings>(
  key: K,
  incoming: unknown,
  current: DesktopSettings[K],
): DesktopSettings[K] {
  const fallback = DEFAULT_DESKTOP_SETTINGS[key];
  if (typeof fallback === 'number') {
    const n = Number(incoming);
    const safe = Number.isFinite(n) ? n : (fallback as number);
    const bounds = NUMBER_BOUNDS[key];
    const rounded = Math.round(safe);
    const clamped = bounds ? Math.min(bounds[1], Math.max(bounds[0], rounded)) : rounded;
    return clamped as DesktopSettings[K];
  }
  if (typeof fallback === 'boolean') {
    return Boolean(incoming) as DesktopSettings[K];
  }
  if (key === 'namingMode') {
    return (NAMING_MODES.has(incoming as string) ? incoming : current) as DesktopSettings[K];
  }
  return (typeof incoming === 'string' ? incoming : fallback) as DesktopSettings[K];
}

/**
 * Filters an untrusted patch (e.g. an imported backup) down to known
 * `DesktopSettings` keys and validates/coerces each value against the type
 * and bounds of its default, so a corrupt or hand-edited import can't push
 * an unsafe value (e.g. a non-numeric or out-of-range `downloadConcurrency`)
 * into live settings. Keys absent from the patch leave `current` unchanged.
 */
export function pickKnownSettings(current: DesktopSettings, patch: Partial<DesktopSettings>): DesktopSettings {
  const merged = { ...current };
  for (const key of Object.keys(DEFAULT_DESKTOP_SETTINGS) as (keyof DesktopSettings)[]) {
    if (key in patch) {
      merged[key] = sanitizeSettingValue(key, patch[key], current[key]) as never;
    }
  }
  return merged;
}

export async function loadSettings(store: Store): Promise<DesktopSettings> {
  const saved = await store.durableGet<Partial<DesktopSettings>>('settings');
  return { ...DEFAULT_DESKTOP_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(store: Store, s: DesktopSettings): Promise<void> {
  await store.durableSet('settings', s);
}
