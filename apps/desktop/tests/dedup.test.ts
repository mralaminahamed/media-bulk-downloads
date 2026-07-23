import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../src/storage/kv.ts';
import { recordDownloads } from '../src/storage/history.ts';
import { downloadedKeysOnDisk, splitByDownloaded } from '../src/platform/dedup.ts';
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

Deno.test('dedup keeps only entries whose file still exists on disk', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await recordDownloads(store, [h('https://x/a.jpg', 1, { path: '/exists/a.jpg' })]);
  await recordDownloads(store, [h('https://x/b.jpg', 2, { path: '/gone/b.jpg' })]);
  const statImpl = (p: string) => p === '/exists/a.jpg' ? Promise.resolve({}) : Promise.reject(new Error('nf'));
  const keys = await downloadedKeysOnDisk(store, { statImpl });
  const { keep, skipped } = splitByDownloaded(
    [{ src: 'https://x/a.jpg' }, { src: 'https://x/c.jpg' }], keys,
  );
  assertEquals(skipped.map((s) => s.src), ['https://x/a.jpg']); // on disk → skip
  assertEquals(keep.map((s) => s.src), ['https://x/c.jpg']);    // never downloaded → keep
  store.close();
});

Deno.test('dedup treats history entries with no recorded path as re-downloadable', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await recordDownloads(store, [h('https://x/no-path.jpg', 1)]); // no path field at all
  const keys = await downloadedKeysOnDisk(store, { statImpl: () => Promise.resolve({}) });
  assertEquals(keys.size, 0);
  store.close();
});
