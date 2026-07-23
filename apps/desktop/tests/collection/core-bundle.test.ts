import { assert, assertEquals } from 'jsr:@std/assert';
import { buildCoreBundle } from '../../src/build/collector.ts';
import type { HistoryEntry } from '@mbd/core/types';

const h = (src: string, time: number): HistoryEntry => ({
  src,
  filename: src.split('/').pop()!,
  kind: 'image',
  type: 'image/jpeg',
  sourcePageUrl: 'https://x/',
  time,
});

Deno.test('core bundle exports the backend surface and merges correctly', async () => {
  await buildCoreBundle();
  const m = await import('../../src/core-bundle/download-name.gen.js');
  assertEquals(typeof m.buildDownloadFilename, 'function');
  assertEquals(typeof m.mergeHistory, 'function');
  assertEquals(typeof m.partitionByDownloaded, 'function');
  assert(m.SrcKeySet);
  const merged = m.mergeHistory([], [h('https://x/a.jpg', 2), h('https://x/a.jpg', 5)]);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].time, 5);
  assertEquals(m.SrcKeySet.from(['https://x/a.jpg?sig=1']).has('https://x/a.jpg?sig=2'), true);
});
