import { SettingsData } from '@/types';

/**
 * Per-host preference overrides (#293). A Record<registrableDomain,
 * Partial<SettingsData>> in chrome.storage.local, merged OVER the global
 * settings so a site opens with its own remembered collection preferences.
 * Absent host = {} = pure global (no behaviour change). Never synced — many
 * hosts would blow the sync per-item quota, and host prefs are device-local.
 *
 * Only HOST_OVERRIDE_FIELDS are ever stored or merged; download-destination and
 * UI-geometry fields are deliberately excluded (see the design spec) so a stored
 * override can never be a silent no-op or corrupt the global editor.
 */
export const PER_HOST_SETTINGS_KEY = 'perHostSettings';

/** The only settings a per-host override remembers. Every one applies at a read
 *  site this feature wires (popup engine + content script + popup convert path). */
export const HOST_OVERRIDE_FIELDS: readonly (keyof SettingsData)[] = [
  'minimumImageSize', 'excludeBase64Images', 'excludeEmoji',
  'resolveOriginals', 'captureHlsStreams', 'smartPageDefaults',
  'deepScanMaxItems', 'deepScanMaxScrolls', 'deepScanMaxSeconds', 'deepScanClickLoadMore',
  'convertImagesTo', 'convertMetadata',
];

/** A plain object, or {} — so a corrupt string/array/number can't inject junk. */
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Keep only allowlisted keys that are present. Defends the merge: a corrupt or
 *  legacy stored entry can never inject a non-allowlisted field. Pure. */
export function pickHostFields(s: Partial<SettingsData>): Partial<SettingsData> {
  const src = asObject(s);
  const out: Record<string, unknown> = {};
  for (const k of HOST_OVERRIDE_FIELDS) {
    if (k in src) out[k] = src[k];
  }
  return out as Partial<SettingsData>;
}

/** Effective settings = global with the host's allowlisted override on top.
 *  Precedence DEFAULT → global → host (global already has DEFAULT baked in). Pure. */
export function applyHostOverride(global: SettingsData, override: Partial<SettingsData>): SettingsData {
  return { ...global, ...pickHostFields(override) };
}
