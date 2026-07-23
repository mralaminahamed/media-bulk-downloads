import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../src/storage/kv.ts';

Deno.test('durableSet then durableGet round-trips settings', async () => {
  const path = await Deno.makeTempFile({ suffix: '.kv' });
  const store = await openStore(path);
  const settings = { downloadPath: '{domain}', namingMode: 'prefixed', fileNamePrefix: 'image_' };
  await store.durableSet('settings', settings);
  const got = await store.durableGet<typeof settings>('settings');
  assertEquals(got, settings);
  store.close();
});

Deno.test('durableGet returns null for a missing key', async () => {
  const path = await Deno.makeTempFile({ suffix: '.kv' });
  const store = await openStore(path);
  assertEquals(await store.durableGet('nope'), null);
  store.close();
});
