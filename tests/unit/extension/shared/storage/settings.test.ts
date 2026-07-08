import { DEFAULT_SETTINGS, withDefaults } from '@/extension/shared/storage/settings';

describe('DEFAULT_SETTINGS naming/saveAs defaults', () => {
  it('defaults to prefixed naming and no save-as dialog', () => {
    expect(DEFAULT_SETTINGS.namingMode).toBe('prefixed');
    expect(DEFAULT_SETTINGS.saveAs).toBe(false);
  });

  it('defaults exclude-emoji off', () => {
    expect(DEFAULT_SETTINGS.excludeEmoji).toBe(false);
  });
});

describe('withDefaults', () => {
  it('returns a full copy of defaults for empty/nullish input', () => {
    expect(withDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults({})).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores non-object garbage input', () => {
    expect(withDefaults('nope')).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults(42)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults(true)).toEqual(DEFAULT_SETTINGS);
  });

  it('overlays provided fields over defaults', () => {
    const result = withDefaults({ downloadPath: 'Pics', minimumImageSize: 128 });
    expect(result.downloadPath).toBe('Pics');
    expect(result.minimumImageSize).toBe(128);
    // Untouched fields fall back to defaults.
    expect(result.fileNamePrefix).toBe(DEFAULT_SETTINGS.fileNamePrefix);
  });

  it('deep-merges bubblePosition so legacy stored settings get the corner', () => {
    // Legacy settings from before the bubble feature (no bubblePosition).
    const legacy = { downloadPath: '', fileNamePrefix: 'image_' };
    expect(withDefaults(legacy).bubblePosition).toEqual(DEFAULT_SETTINGS.bubblePosition);
  });

  it('merges a partial bubblePosition without dropping the corner', () => {
    const result = withDefaults({ bubblePosition: { x: 99, y: 5 } as never });
    expect(result.bubblePosition).toEqual({ corner: 'bottom-right', x: 99, y: 5 });
  });

  it('does not mutate the shared DEFAULT_SETTINGS object', () => {
    const before = JSON.stringify(DEFAULT_SETTINGS);
    withDefaults({ bubblePosition: { corner: 'top-left', x: 1, y: 1 } });
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
  });
});

describe('resolveOriginals setting', () => {
  it('defaults to false', () => {
    expect(DEFAULT_SETTINGS.resolveOriginals).toBe(false);
  });
  it('withDefaults backfills it for old stored settings', () => {
    expect(withDefaults({}).resolveOriginals).toBe(false);
  });
});

describe('deep-scan cap settings', () => {
  it('default to the documented caps', () => {
    expect(DEFAULT_SETTINGS.deepScanMaxItems).toBe(1000);
    expect(DEFAULT_SETTINGS.deepScanMaxSeconds).toBe(20);
    expect(DEFAULT_SETTINGS.deepScanMaxScrolls).toBe(40);
  });
  it('withDefaults backfills them for old stored settings and overlays overrides', () => {
    expect(withDefaults({}).deepScanMaxItems).toBe(1000);
    expect(withDefaults({ deepScanMaxScrolls: 100 }).deepScanMaxScrolls).toBe(100);
  });
  it('deepScanClickLoadMore defaults to false', () => {
    expect(DEFAULT_SETTINGS.deepScanClickLoadMore).toBe(false);
    expect(withDefaults({}).deepScanClickLoadMore).toBe(false);
  });
});

describe('withDefaults — corrupt shapes', () => {
  it('ignores a non-object nested value instead of injecting junk index keys', () => {
    const s = withDefaults({ bubblePosition: 'oops', bubblePanelPoint: [1, 2] } as unknown);
    expect(s.bubblePosition).toEqual(DEFAULT_SETTINGS.bubblePosition);
    expect(s.bubblePanelPoint).toEqual(DEFAULT_SETTINGS.bubblePanelPoint);
  });
});
