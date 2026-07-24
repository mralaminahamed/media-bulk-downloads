import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../../src/storage/kv.ts';
import { loadSettings, saveSettings } from '../../src/storage/settings.ts';
import { loadHistory, recordDownloads, type StoredHistoryEntry } from '../../src/storage/history.ts';
import { loadFavourites, addFavourite } from '../../src/storage/favourites.ts';
import { createMediaStore } from '../../src/server/media-store.ts';
import { createSseHub } from '../../src/server/sse.ts';
import { buildRoutes } from '../../src/server/routes.ts';
import type { FavouriteEntry } from '@mbd/core/types';

function json(body: unknown, method = 'POST') {
  return new Request('http://x/', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

const fakeQueue = { enqueue: () => Promise.resolve(), status: () => ({ pending: 0, active: 0, done: 0, failed: 0 }), drain: () => Promise.resolve(), resume: () => Promise.resolve() };

Deno.test('download enqueues known items, skips unknown srcs', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  const media = createMediaStore();
  media.merge([{ src: 'https://x/a.jpg', kind: 'image' }]);
  const enqueued: unknown[] = [];
  const queue = { enqueue: (xs: unknown[]) => { enqueued.push(...xs); return Promise.resolve(); }, status: () => ({ pending: 0, active: 0, done: 0, failed: 0 }), drain: () => Promise.resolve(), resume: () => Promise.resolve() };
  let settings = await loadSettings(store);
  settings = { ...settings, skipDuplicateDownloads: false };
  const routes = buildRoutes({
    store,
    queue,
    media,
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  const res = await routes['POST /api/download'](json({ srcs: ['https://x/a.jpg', 'https://x/missing.jpg'] }), new URL('http://x/api/download'));
  assertEquals(await res.json(), { queued: 1, skipped: 0 });
  assertEquals(enqueued.length, 1);
  store.close();
});

Deno.test('settings round-trip through PUT then GET', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  await routes['PUT /api/settings'](json({ ...settings, fileNamePrefix: 'pic_' }, 'PUT'), new URL('http://x/api/settings'));
  const got = await (await routes['GET /api/settings'](new Request('http://x/'), new URL('http://x/api/settings'))).json();
  assertEquals(got.fileNamePrefix, 'pic_');
  store.close();
});

Deno.test('POST /api/deep-scan invokes the injected deepScan dep', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  let calls = 0;
  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    deepScan: () => { calls++; },
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  const res = await routes['POST /api/deep-scan'](new Request('http://x/', { method: 'POST' }), new URL('http://x/api/deep-scan'));
  assertEquals(await res.json(), { ok: true });
  assertEquals(calls, 1);
  store.close();
});

Deno.test('POST /api/deep-scan is a no-op (still 200) when deepScan dep is absent', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  const res = await routes['POST /api/deep-scan'](new Request('http://x/', { method: 'POST' }), new URL('http://x/api/deep-scan'));
  assertEquals(await res.json(), { ok: true });
  store.close();
});

Deno.test('settings round-trip through PUT then GET includes deepScanClickLoadMore', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  await routes['PUT /api/settings'](json({ ...settings, deepScanClickLoadMore: true }, 'PUT'), new URL('http://x/api/settings'));
  const got = await (await routes['GET /api/settings'](new Request('http://x/'), new URL('http://x/api/settings'))).json();
  assertEquals(got.deepScanClickLoadMore, true);
  store.close();
});

Deno.test('POST /api/capture invokes the injected capture dep with src', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  const calls: string[] = [];
  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    capture: (src) => { calls.push(src); },
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  const res = await routes['POST /api/capture'](json({ src: 'x' }), new URL('http://x/api/capture'));
  assertEquals(await res.json(), { ok: true });
  assertEquals(calls, ['x']);
  store.close();
});

Deno.test('POST /api/capture is a no-op (still 200) when capture dep is absent', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);
  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    exportData: async () => ({ version: 1, settings, history: await loadHistory(store), favourites: await loadFavourites(store) }),
    importData: async () => ({ history: 0, favourites: 0 }),
  });
  const res = await routes['POST /api/capture'](json({ src: 'x' }), new URL('http://x/api/capture'));
  assertEquals(await res.json(), { ok: true });
  store.close();
});

Deno.test('export returns settings + history + favourites; import merges without dupes', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  let settings = await loadSettings(store);

  const existingHistoryEntry: StoredHistoryEntry = {
    src: 'https://x/a.jpg',
    filename: 'a.jpg',
    kind: 'image',
    type: 'image/jpeg',
    sourcePageUrl: 'https://x/',
    time: 1000,
  };
  await recordDownloads(store, [existingHistoryEntry]);

  const existingFavourite: FavouriteEntry = {
    src: 'https://x/fav.jpg',
    kind: 'image',
    type: 'image/jpeg',
    sourcePageUrl: 'https://x/',
    time: 1000,
  };
  await addFavourite(store, existingFavourite);

  const routes = buildRoutes({
    store,
    queue: fakeQueue,
    media: createMediaStore(),
    sse: createSseHub(),
    settings: () => settings,
    setSettings: async (s) => { settings = s; await saveSettings(store, s); },
    navigate: () => {},
    exportData: async () => ({
      version: 1,
      settings,
      history: await loadHistory(store),
      favourites: await loadFavourites(store),
    }),
    importData: async (backup) => {
      if (backup.history?.length) await recordDownloads(store, backup.history as StoredHistoryEntry[]);
      if (backup.favourites?.length) {
        for (const entry of backup.favourites as FavouriteEntry[]) await addFavourite(store, entry);
      }
      if (backup.settings) {
        settings = { ...settings, ...backup.settings };
        await saveSettings(store, settings);
      }
      return { history: (await loadHistory(store)).length, favourites: (await loadFavourites(store)).length };
    },
  });

  const exported = await (
    await routes['GET /api/export'](new Request('http://x/'), new URL('http://x/api/export'))
  ).json();
  assertEquals(exported.version, 1);
  assertEquals(exported.history.length, 1);
  assertEquals(exported.favourites.length, 1);
  assertEquals(exported.settings.fileNamePrefix, settings.fileNamePrefix);

  const overlappingHistory: StoredHistoryEntry = { ...existingHistoryEntry, time: 2000 };
  const newHistory: StoredHistoryEntry = {
    src: 'https://x/b.jpg',
    filename: 'b.jpg',
    kind: 'image',
    type: 'image/jpeg',
    sourcePageUrl: 'https://x/',
    time: 3000,
  };
  const overlappingFavourite: FavouriteEntry = { ...existingFavourite, time: 2000 };
  const newFavourite: FavouriteEntry = {
    src: 'https://x/favb.jpg',
    kind: 'image',
    type: 'image/jpeg',
    sourcePageUrl: 'https://x/',
    time: 3000,
  };

  const importRes = await (
    await routes['POST /api/import'](
      json({
        settings: { fileNamePrefix: 'imported_' },
        history: [overlappingHistory, newHistory],
        favourites: [overlappingFavourite, newFavourite],
      }),
      new URL('http://x/api/import'),
    )
  ).json();
  assertEquals(importRes, { ok: true, history: 2, favourites: 2 });

  const exportedAfter = await (
    await routes['GET /api/export'](new Request('http://x/'), new URL('http://x/api/export'))
  ).json();
  assertEquals(exportedAfter.history.length, 2);
  assertEquals(exportedAfter.favourites.length, 2);
  assertEquals(exportedAfter.settings.fileNamePrefix, 'imported_');

  store.close();
});
