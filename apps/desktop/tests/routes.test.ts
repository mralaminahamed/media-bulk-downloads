import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../src/storage/kv.ts';
import { loadSettings, saveSettings } from '../src/storage/settings.ts';
import { createMediaStore } from '../src/server/media-store.ts';
import { createSseHub } from '../src/server/sse.ts';
import { buildRoutes } from '../src/server/routes.ts';

function json(body: unknown, method = 'POST') {
  return new Request('http://x/', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

Deno.test('download enqueues known items, skips unknown srcs', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  const media = createMediaStore();
  media.merge([{ src: 'https://x/a.jpg', kind: 'image' }]);
  const enqueued: unknown[] = [];
  const queue = { enqueue: (xs: unknown[]) => { enqueued.push(...xs); return Promise.resolve(); }, status: () => ({ pending: 0, active: 0, done: 0, failed: 0 }), drain: () => Promise.resolve(), resume: () => Promise.resolve() };
  let settings = await loadSettings(store);
  settings = { ...settings, skipDuplicateDownloads: false };
  const routes = buildRoutes({ store, queue, media, sse: createSseHub(), settings: () => settings, setSettings: async (s) => { settings = s; await saveSettings(store, s); }, navigate: () => {} });
  const res = await routes['POST /api/download'](json({ srcs: ['https://x/a.jpg', 'https://x/missing.jpg'] }), new URL('http://x/api/download'));
  assertEquals(await res.json(), { queued: 1, skipped: 0 });
  assertEquals(enqueued.length, 1);
  store.close();
});

Deno.test('settings round-trip through PUT then GET', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  const routes = buildRoutes({ store, queue: { enqueue: () => Promise.resolve(), status: () => ({ pending: 0, active: 0, done: 0, failed: 0 }), drain: () => Promise.resolve(), resume: () => Promise.resolve() }, media: createMediaStore(), sse: createSseHub(), settings: () => settings, setSettings: async (s) => { settings = s; await saveSettings(store, s); }, navigate: () => {} });
  await routes['PUT /api/settings'](json({ ...settings, fileNamePrefix: 'pic_' }, 'PUT'), new URL('http://x/api/settings'));
  const got = await (await routes['GET /api/settings'](new Request('http://x/'), new URL('http://x/api/settings'))).json();
  assertEquals(got.fileNamePrefix, 'pic_');
  store.close();
});
