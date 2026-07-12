import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@/extension/shared/storage/settings';
import {
  HOST_OVERRIDE_FIELDS, PER_HOST_SETTINGS_KEY, pickHostFields, applyHostOverride,
} from '@/extension/shared/storage/per-host-settings';

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
