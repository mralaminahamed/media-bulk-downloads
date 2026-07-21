import { DEFAULT_SETTINGS, withDefaults } from '@mbd/storage/settings';

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
    expect(result.fileNamePrefix).toBe(DEFAULT_SETTINGS.fileNamePrefix);
  });

  it('deep-merges bubblePosition so legacy stored settings get the corner', () => {
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

describe('sankakuAuthedOriginals setting', () => {
  it('defaults sankakuAuthedOriginals to false (Tier-2 opt-in, off by default)', () => {
    expect(DEFAULT_SETTINGS.sankakuAuthedOriginals).toBe(false);
  });
});

describe('per-kind fetch settings', () => {
  it('default all three kinds on (collect everything)', () => {
    expect(DEFAULT_SETTINGS.fetchImages).toBe(true);
    expect(DEFAULT_SETTINGS.fetchVideo).toBe(true);
    expect(DEFAULT_SETTINGS.fetchAudio).toBe(true);
  });
  it('withDefaults backfills them on for old stored settings and overlays an off override', () => {
    expect(withDefaults({}).fetchAudio).toBe(true);
    expect(withDefaults({ fetchAudio: false }).fetchAudio).toBe(false);
    expect(withDefaults({ fetchAudio: false }).fetchImages).toBe(true);
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
  it('clamps corrupt loop bounds so a synced/hand-edited value cannot neuter or hang the scan', () => {
    const s = withDefaults({ deepScanMaxItems: -5, deepScanMaxSeconds: 'abc' as never, deepScanMaxScrolls: 0 });
    expect(s.deepScanMaxItems).toBeGreaterThanOrEqual(1);
    expect(s.deepScanMaxSeconds).toBeGreaterThanOrEqual(1);
    expect(s.deepScanMaxScrolls).toBeGreaterThanOrEqual(1);
    expect(withDefaults({ deepScanMaxItems: 2500 }).deepScanMaxItems).toBe(2500);
  });
});

describe('audioFormat setting (#321)', () => {
  it('defaults to the M4A passthrough (no re-encode)', () => {
    expect(DEFAULT_SETTINGS.audioFormat).toBe('m4a');
    expect(withDefaults({}).audioFormat).toBe('m4a');
  });
  it('preserves a valid stored format', () => {
    expect(withDefaults({ audioFormat: 'mp3-320' }).audioFormat).toBe('mp3-320');
  });
  it('falls back to m4a for an unknown/corrupt value rather than driving the encoder on garbage', () => {
    expect(withDefaults({ audioFormat: 'mp3-256' as never }).audioFormat).toBe('m4a');
    expect(withDefaults({ audioFormat: 42 as never }).audioFormat).toBe('m4a');
  });
});

describe('withDefaults — corrupt shapes', () => {
  it('ignores a non-object nested value instead of injecting junk index keys', () => {
    const s = withDefaults({ bubblePosition: 'oops', bubblePanelPoint: [1, 2] } as unknown);
    expect(s.bubblePosition).toEqual(DEFAULT_SETTINGS.bubblePosition);
    expect(s.bubblePanelPoint).toEqual(DEFAULT_SETTINGS.bubblePanelPoint);
  });
});

describe('smartPageDefaults setting', () => {
  it('defaults to true', () => {
    expect(DEFAULT_SETTINGS.smartPageDefaults).toBe(true);
  });
  it('withDefaults backfills it for old stored settings', () => {
    expect(withDefaults({}).smartPageDefaults).toBe(true);
  });
  it('preserves an explicit opt-out through withDefaults', () => {
    expect(withDefaults({ smartPageDefaults: false }).smartPageDefaults).toBe(false);
  });
});

describe('rememberScanBehaviour setting', () => {
  it('defaults to true', () => {
    expect(DEFAULT_SETTINGS.rememberScanBehaviour).toBe(true);
  });
  it('withDefaults backfills it for old stored settings', () => {
    expect(withDefaults({}).rememberScanBehaviour).toBe(true);
  });
  it('preserves an explicit opt-out through withDefaults', () => {
    expect(withDefaults({ rememberScanBehaviour: false }).rememberScanBehaviour).toBe(false);
  });
});

describe('downloadConcurrency setting', () => {
  it('defaults to 5', () => {
    expect(DEFAULT_SETTINGS.downloadConcurrency).toBe(5);
  });
  it('is preserved through withDefaults', () => {
    expect(withDefaults({ downloadConcurrency: 8 }).downloadConcurrency).toBe(8);
  });
  it('falls back to default when absent', () => {
    expect(withDefaults({}).downloadConcurrency).toBe(5);
  });
  it('clamps a corrupt (synced or imported) value to a sane range', () => {
    expect(withDefaults({ downloadConcurrency: 0 as never }).downloadConcurrency).toBe(1);
    expect(withDefaults({ downloadConcurrency: -3 as never }).downloadConcurrency).toBe(1);
    expect(withDefaults({ downloadConcurrency: 'many' as never }).downloadConcurrency).toBe(5);
    expect(withDefaults({ downloadConcurrency: NaN as never }).downloadConcurrency).toBe(5);
    expect(withDefaults({ downloadConcurrency: 999 as never }).downloadConcurrency).toBe(20);
    expect(withDefaults({ downloadConcurrency: 3.9 as never }).downloadConcurrency).toBe(3);
  });
});

describe('minimumImageSize + UI-dimension settings clamping', () => {
  it('falls back to the numeric default for a corrupt (non-numeric) minimumImageSize', () => {
    expect(withDefaults({ minimumImageSize: 'abc' as never }).minimumImageSize).toBe(DEFAULT_SETTINGS.minimumImageSize);
    expect(withDefaults({ minimumImageSize: NaN as never }).minimumImageSize).toBe(DEFAULT_SETTINGS.minimumImageSize);
  });
  it('clamps a negative minimumImageSize up to 0', () => {
    expect(withDefaults({ minimumImageSize: -50 as never }).minimumImageSize).toBe(0);
  });
  it('preserves a valid minimumImageSize override', () => {
    expect(withDefaults({ minimumImageSize: 500 }).minimumImageSize).toBe(500);
  });
  it('clamps the UI-dimension fields (popup/thumbnail/preview/bubble) to their known ranges', () => {
    const s = withDefaults({
      popupWidth: 10 as never,
      popupHeight: 99999 as never,
      thumbnailSize: 'x' as never,
      previewSize: -1 as never,
      bubbleWidth: 1 as never,
      bubbleHeight: 999999 as never,
    });
    expect(s.popupWidth).toBeGreaterThanOrEqual(320);
    expect(s.popupHeight).toBeLessThanOrEqual(600);
    expect(s.thumbnailSize).toBe(DEFAULT_SETTINGS.thumbnailSize);
    expect(s.previewSize).toBeGreaterThanOrEqual(240);
    expect(s.bubbleWidth).toBeGreaterThanOrEqual(320);
    expect(s.bubbleHeight).toBeLessThanOrEqual(2160);
  });
});

describe('skipDuplicateDownloads setting', () => {
  it('defaults to true', () => {
    expect(DEFAULT_SETTINGS.skipDuplicateDownloads).toBe(true);
  });
  it('withDefaults backfills it for old stored settings', () => {
    expect(withDefaults({}).skipDuplicateDownloads).toBe(true);
  });
  it('preserves an explicit opt-out through withDefaults', () => {
    expect(withDefaults({ skipDuplicateDownloads: false }).skipDuplicateDownloads).toBe(false);
  });
});
