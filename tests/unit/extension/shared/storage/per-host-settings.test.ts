import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, loadStoredSettings } from '@/extension/shared/storage/settings';
import {
  HOST_OVERRIDE_FIELDS, PER_HOST_SETTINGS_KEY, pickHostFields, applyHostOverride,
  loadPerHostSettings, overrideForHost, savePerHostSettings, clearPerHostSettings,
  loadEffectiveSettingsForHost,
} from '@/extension/shared/storage/per-host-settings';
import type { Mock } from 'vitest';

describe('per-host-settings — pure core', () => {
  it('key + allowlist are the documented values', () => {
    expect(PER_HOST_SETTINGS_KEY).toBe('perHostSettings');
    expect(HOST_OVERRIDE_FIELDS).toEqual([
      'minimumImageSize', 'excludeBase64Images', 'excludeEmoji',
      'resolveOriginals', 'captureHlsStreams', 'smartPageDefaults',
      'deepScanMaxItems', 'deepScanMaxScrolls', 'deepScanMaxSeconds', 'deepScanClickLoadMore',
      'convertImagesTo', 'convertMetadata',
    ]);
  });

  it('pickHostFields keeps only present allowlisted keys', () => {
    const picked = pickHostFields({ minimumImageSize: 1024, downloadPath: 'x', popupWidth: 900 } as never);
    expect(picked).toEqual({ minimumImageSize: 1024 });
  });

  it('pickHostFields drops a non-object input to {}', () => {
    expect(pickHostFields(null as never)).toEqual({});
    expect(pickHostFields('nope' as never)).toEqual({});
  });

  it('applyHostOverride layers override over global (host wins), non-allowlisted ignored', () => {
    const global = { ...DEFAULT_SETTINGS, minimumImageSize: 0, resolveOriginals: false };
    const eff = applyHostOverride(global, { minimumImageSize: 1024, resolveOriginals: true, downloadPath: 'archive' } as never);
    expect(eff.minimumImageSize).toBe(1024);
    expect(eff.resolveOriginals).toBe(true);
    expect(eff.downloadPath).toBe(global.downloadPath); // non-allowlisted override ignored
  });

  it('applyHostOverride with empty override === global', () => {
    const global = { ...DEFAULT_SETTINGS, excludeEmoji: true };
    expect(applyHostOverride(global, {})).toEqual(global);
  });
});

describe('per-host-settings — storage CRUD', () => {
  beforeEach(async () => { await chrome.storage.local.clear(); });

  it('absent store loads as {}, absent host as {}', async () => {
    expect(await loadPerHostSettings()).toEqual({});
    expect(await overrideForHost('booru.example')).toEqual({});
  });

  it('save → load round-trips an allowlisted override for a host', async () => {
    await savePerHostSettings('booru.example', { minimumImageSize: 1024, downloadPath: 'x' } as never);
    expect(await overrideForHost('booru.example')).toEqual({ minimumImageSize: 1024 });
    expect(await overrideForHost('other.example')).toEqual({});
  });

  it('two hosts saved back-to-back both persist (serialized, no clobber)', async () => {
    await Promise.all([
      savePerHostSettings('a.example', { minimumImageSize: 256 }),
      savePerHostSettings('b.example', { minimumImageSize: 512 }),
    ]);
    const store = await loadPerHostSettings();
    expect(store['a.example']).toEqual({ minimumImageSize: 256 });
    expect(store['b.example']).toEqual({ minimumImageSize: 512 });
  });

  it('clear removes only that host', async () => {
    await savePerHostSettings('a.example', { excludeEmoji: true });
    await savePerHostSettings('b.example', { excludeEmoji: true });
    await clearPerHostSettings('a.example');
    expect(await overrideForHost('a.example')).toEqual({});
    expect(await overrideForHost('b.example')).toEqual({ excludeEmoji: true });
  });

  it('empty host or empty patch is a no-op (never writes a "" entry)', async () => {
    await savePerHostSettings('', { minimumImageSize: 1024 });
    await savePerHostSettings('a.example', {}); // nothing allowlisted present
    await savePerHostSettings('a.example', { popupWidth: 900 } as never); // non-allowlisted only
    expect(await loadPerHostSettings()).toEqual({});
  });

  it('a corrupt stored value loads as {}', async () => {
    await chrome.storage.local.set({ perHostSettings: 'garbage' });
    expect(await loadPerHostSettings()).toEqual({});
  });
});

type SyncCb = (r: { settings?: unknown }) => void;

describe('effective settings resolver', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    (chrome.storage.sync.get as Mock).mockReset();
  });

  it('loadStoredSettings merges stored over defaults, tolerates unset', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k: unknown, cb: SyncCb) => cb({}));
    expect((await loadStoredSettings()).minimumImageSize).toBe(0);
    (chrome.storage.sync.get as Mock).mockImplementation((_k: unknown, cb: SyncCb) => cb({ settings: { minimumImageSize: 300 } }));
    expect((await loadStoredSettings()).minimumImageSize).toBe(300);
  });

  it('no override → effective === global', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k: unknown, cb: SyncCb) => cb({ settings: { minimumImageSize: 200 } }));
    const eff = await loadEffectiveSettingsForHost('booru.example');
    expect(eff.minimumImageSize).toBe(200);
  });

  it('host override wins over global (keyed by registrable domain)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k: unknown, cb: SyncCb) => cb({ settings: { minimumImageSize: 200, resolveOriginals: false } }));
    await chrome.storage.local.set({ perHostSettings: { 'booru.example': { minimumImageSize: 1024, resolveOriginals: true } } });
    // A subdomain reduces to the registrable domain, so it picks up the same override.
    const eff = await loadEffectiveSettingsForHost('img.booru.example');
    expect(eff.minimumImageSize).toBe(1024);
    expect(eff.resolveOriginals).toBe(true);
  });
});
