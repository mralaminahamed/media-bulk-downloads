import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../../src/storage/kv.ts';
import { DEFAULT_DESKTOP_SETTINGS, loadSettings, pickKnownSettings, saveSettings } from '../../src/storage/settings.ts';

Deno.test('settings default then round-trip', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  assertEquals(await loadSettings(store), DEFAULT_DESKTOP_SETTINGS);
  const next = { ...DEFAULT_DESKTOP_SETTINGS, downloadPath: '{domain}/{date}', downloadConcurrency: 3 };
  await saveSettings(store, next);
  assertEquals(await loadSettings(store), next);
  store.close();
});

Deno.test('settings old partial forward-fills new defaults', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await store.durableSet('settings', { downloadPath: 'x', fileNamePrefix: 'p_' });
  const loaded = await loadSettings(store);
  assertEquals(loaded.downloadPath, 'x');
  assertEquals(loaded.fileNamePrefix, 'p_');
  assertEquals(loaded.thumbnailSize, 150);
  assertEquals(loaded.previewSize, 640);
  assertEquals(loaded.minimumImageSize, 0);
  assertEquals(loaded.excludeBase64Images, false);
  assertEquals(loaded.excludeEmoji, false);
  assertEquals(loaded.smartPageDefaults, false);
  assertEquals(loaded.rememberScanBehaviour, false);
  assertEquals(loaded.deepScanMaxItems, 1000);
  assertEquals(loaded.deepScanMaxSeconds, 120);
  assertEquals(loaded.deepScanMaxScrolls, 200);
  assertEquals(loaded.nearDuplicateThreshold, 8);
  assertEquals(loaded.metadataSidecar, false);
  assertEquals(loaded.namingMode, 'prefixed');
  assertEquals(loaded.downloadConcurrency, 5);
  assertEquals(loaded.skipDuplicateDownloads, true);
  store.close();
});

Deno.test('pickKnownSettings clamps a corrupt downloadConcurrency (non-numeric) to the current value', () => {
  const current = { ...DEFAULT_DESKTOP_SETTINGS, downloadConcurrency: 5 };
  const result = pickKnownSettings(current, { downloadConcurrency: 'abc' as unknown as number });
  assertEquals(result.downloadConcurrency >= 1 && result.downloadConcurrency <= 10, true);
});

Deno.test('pickKnownSettings clamps downloadConcurrency below range up to 1', () => {
  const result = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, { downloadConcurrency: 0 });
  assertEquals(result.downloadConcurrency, 1);
});

Deno.test('pickKnownSettings clamps downloadConcurrency above range down to 10', () => {
  const result = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, { downloadConcurrency: 999 });
  assertEquals(result.downloadConcurrency, 10);
});

Deno.test('pickKnownSettings clamps nearDuplicateThreshold into [2, 16]', () => {
  const low = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, { nearDuplicateThreshold: -5 });
  const high = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, { nearDuplicateThreshold: 1000 });
  assertEquals(low.nearDuplicateThreshold, 2);
  assertEquals(high.nearDuplicateThreshold, 16);
});

Deno.test('pickKnownSettings floors negative non-negative-only numeric fields at 0', () => {
  const result = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, {
    minimumImageSize: -10,
    deepScanMaxItems: -1,
    deepScanMaxSeconds: -1,
    deepScanMaxScrolls: -1,
  });
  assertEquals(result.minimumImageSize, 0);
  assertEquals(result.deepScanMaxItems, 0);
  assertEquals(result.deepScanMaxSeconds, 0);
  assertEquals(result.deepScanMaxScrolls, 0);
});

Deno.test('pickKnownSettings rejects an invalid namingMode, keeping the current value', () => {
  const current = { ...DEFAULT_DESKTOP_SETTINGS, namingMode: 'original' as const };
  const result = pickKnownSettings(current, { namingMode: 'xyz' as unknown as 'original' | 'prefixed' });
  assertEquals(result.namingMode, 'original');
});

Deno.test('pickKnownSettings accepts a valid namingMode', () => {
  const result = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, { namingMode: 'original' });
  assertEquals(result.namingMode, 'original');
});

Deno.test('pickKnownSettings coerces non-boolean values for boolean fields', () => {
  const result = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, {
    skipDuplicateDownloads: 0 as unknown as boolean,
  });
  assertEquals(result.skipDuplicateDownloads, false);
});

Deno.test('pickKnownSettings rejects a non-string downloadPath, falling back to the default', () => {
  const result = pickKnownSettings(DEFAULT_DESKTOP_SETTINGS, { downloadPath: 42 as unknown as string });
  assertEquals(result.downloadPath, DEFAULT_DESKTOP_SETTINGS.downloadPath);
});

Deno.test('pickKnownSettings leaves a key untouched when absent from the patch', () => {
  const current = { ...DEFAULT_DESKTOP_SETTINGS, fileNamePrefix: 'custom_' };
  const result = pickKnownSettings(current, {});
  assertEquals(result.fileNamePrefix, 'custom_');
});
