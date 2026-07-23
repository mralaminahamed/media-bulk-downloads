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
