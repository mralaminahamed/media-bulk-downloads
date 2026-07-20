import { SettingsData, SetSettingsMessage } from '@mbd/core/types';
import { ExcludedMatchers } from '@mbd/core/collection/filters';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { DEFAULT_SETTINGS, withDefaults } from '@mbd/storage/settings';
import { excludedMatchers } from '@mbd/storage/excluded';

/**
 * Shared background state + settings lifecycle. Every other background module
 * reads `currentSettings` / `excludedCache` from here as a live ES-module binding
 * (they update in place when this module reassigns them); only this module
 * reassigns them, via loadSettings / setCurrentSettings / reloadExcluded.
 */

export let currentSettings: SettingsData = { ...DEFAULT_SETTINGS };

/** Replace the live settings (the storage.onChanged handler owns this write). */
export function setCurrentSettings(next: SettingsData): void {
  currentSettings = next;
}

/** Live cache of the blocklist match sets, kept fresh via chrome.storage.onChanged
 *  so the badge count (a synchronous filter) never has to await storage. */
export let excludedCache: ExcludedMatchers = { urls: new SrcKeySet(), hosts: new Set() };

/** Resolves once the blocklist has loaded. Download paths await this (like
 *  settingsReady) so a cold worker woken by the keyboard/context-menu download
 *  never filters against an empty cache and lets a blocklisted item through. */
export let excludedReady: Promise<void> = Promise.resolve();

export function reloadExcluded(): void {
  excludedReady = excludedMatchers()
    .then((m) => { excludedCache = m; })
    .catch(() => { /* retain the previous cache; never wedge the gate */ });
}
reloadExcluded();

let markSettingsLoaded: (() => void) | undefined;
export const settingsReady: Promise<void> = new Promise((resolve) => {
  markSettingsLoaded = resolve;
});

/** Resolve the settingsReady gate (idempotent). Called after the first read and
 *  on any storage.onChanged settings update. */
export function resolveSettingsGate(): void {
  markSettingsLoaded?.();
  markSettingsLoaded = undefined;
}

let applyHook: () => void = () => {};
export function setApplySettingsHook(fn: () => void): void {
  applyHook = fn;
}

/**
 * Load the current settings from storage.
 */
export function loadSettings(): void {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = withDefaults(result.settings);
      applyHook();
    }
    resolveSettingsGate();
  });
}

/** Serialized settings writer. The popup and the on-page bubble both persist
 *  settings; funnelling every write through this one ordered read-modify-write
 *  (instead of each doing a bare storage.sync get→set) stops a concurrent write
 *  from clobbering the other's fields. */
let settingsWriteChain: Promise<void> = Promise.resolve();
/** Resolves with the merged settings that were written, so the caller can push
 *  them to content scripts (SETTINGS_CHANGED) — Safari content scripts don't see
 *  storage.sync changes, so they rely on that broadcast, not storage.onChanged. */
export function writeSettingsPatch(patch: SetSettingsMessage['patch']): Promise<SettingsData> {
  const run = settingsWriteChain.then(() => new Promise<SettingsData>((resolve) => {
    chrome.storage.sync.get(['settings'], (result) => {
      const stored = withDefaults(result.settings);
      const { bubblePosition: bp, bubblePanelPoint: bpp, ...top } = patch;
      const merged: SettingsData = {
        ...stored,
        ...top,
        bubblePosition: { ...stored.bubblePosition, ...(bp ?? {}) },
        ...(bpp !== undefined ? { bubblePanelPoint: bpp } : {}),
      };
      const sanitized = withDefaults(merged);
      chrome.storage.sync.set({ settings: sanitized }, () => resolve(sanitized));
    });
  }));
  settingsWriteChain = run.then(() => undefined, () => undefined);
  return run;
}
