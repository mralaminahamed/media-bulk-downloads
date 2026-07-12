import { SettingsData } from '@/types';
import { registrableDomain } from '../collection/paths';
import { durableSet } from './idb';
import { loadStoredSettings } from './settings';

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

/** The whole per-host store, validated to a plain object of allowlisted overrides. */
export async function loadPerHostSettings(): Promise<Record<string, Partial<SettingsData>>> {
  const result = (await chrome.storage.local.get(PER_HOST_SETTINGS_KEY)) as Record<string, unknown>;
  const raw = asObject(result[PER_HOST_SETTINGS_KEY]);
  const out: Record<string, Partial<SettingsData>> = {};
  for (const [host, val] of Object.entries(raw)) {
    if (host) out[host] = pickHostFields(val as Partial<SettingsData>);
  }
  return out;
}

/** The allowlisted override for one registrable-domain host ({} when absent). */
export async function overrideForHost(host: string): Promise<Partial<SettingsData>> {
  if (!host) return {};
  const store = await loadPerHostSettings();
  return store[host] ?? {};
}

/** Effective settings for a page's host: global (sync) with the host's override
 *  (local) applied. `hostname` is a raw host (e.g. location.hostname); reduced to
 *  its registrable domain for the store key. No override → identical to global. */
export async function loadEffectiveSettingsForHost(hostname: string): Promise<SettingsData> {
  const [global, override] = await Promise.all([
    loadStoredSettings(),
    overrideForHost(registrableDomain(hostname)),
  ]);
  return applyHostOverride(global, override);
}

let writeChain: Promise<void> = Promise.resolve();
function serialize(task: () => Promise<void>): Promise<void> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Persist an allowlisted override for a host. No-op for an empty host or an
 *  empty (nothing-allowlisted) patch — never creates a "" or empty entry. */
export async function savePerHostSettings(host: string, patch: Partial<SettingsData>): Promise<void> {
  const picked = pickHostFields(patch);
  if (!host || Object.keys(picked).length === 0) return;
  return serialize(async () => {
    const store = await loadPerHostSettings();
    store[host] = picked;
    await durableSet(PER_HOST_SETTINGS_KEY, store);
  });
}

/** Clear a host's override entirely ("Reset this site"). */
export async function clearPerHostSettings(host: string): Promise<void> {
  if (!host) return;
  return serialize(async () => {
    const store = await loadPerHostSettings();
    if (!(host in store)) return;
    delete store[host];
    await durableSet(PER_HOST_SETTINGS_KEY, store);
  });
}
