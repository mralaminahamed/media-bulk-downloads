import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../src/storage/kv.ts';
import { recordDownloads, loadHistory, removeHistoryEntry, clearHistory } from '../src/storage/history.ts';
import type { HistoryEntry } from '@mbd/core/types';
import type { StoredHistoryEntry } from '../src/storage/history.ts';

const h = (
  src: string,
  time: number,
  extra: Partial<HistoryEntry> & { path?: string } = {},
): StoredHistoryEntry => ({
  src,
  filename: src.split('/').pop()!,
  kind: 'image' as const,
  type: 'image/jpeg',
  sourcePageUrl: 'https://x/',
  time,
  ...extra,
});

Deno.test('history records, dedups by canonical key, removes, clears', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await recordDownloads(store, [h('https://x/a.jpg?sig=1', 1)]);
  await recordDownloads(store, [h('https://x/a.jpg?sig=2', 2)]); // same image, newer
  let history = await loadHistory(store);
  assertEquals(history.length, 1);
  assertEquals(history[0].time, 2);
  await removeHistoryEntry(store, history[0].src);
  assertEquals((await loadHistory(store)).length, 0);
  await recordDownloads(store, [h('https://x/b.jpg', 3)]);
  await clearHistory(store);
  assertEquals((await loadHistory(store)).length, 0);
  store.close();
});

Deno.test('recorded path survives the store round-trip (mergeHistory + KV serialization)', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await recordDownloads(store, [h('https://x/a.jpg', 1, { path: '/exists/a.jpg' })]);
  const [entry] = await loadHistory(store);
  assertEquals(entry.path, '/exists/a.jpg');
  store.close();
});
