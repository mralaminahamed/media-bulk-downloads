import { DEFAULT_SETTINGS, withDefaults } from '@/extension/shared/settings';

describe('DEFAULT_SETTINGS naming/saveAs defaults', () => {
  it('defaults to prefixed naming and no save-as dialog', () => {
    expect(DEFAULT_SETTINGS.namingMode).toBe('prefixed');
    expect(DEFAULT_SETTINGS.saveAs).toBe(false);
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
