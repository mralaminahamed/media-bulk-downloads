import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../../src/storage/kv.ts';
import { DEFAULT_DESKTOP_SETTINGS, loadSettings, saveSettings } from '../../src/storage/settings.ts';

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
