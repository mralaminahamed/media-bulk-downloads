import { assert, assertEquals } from 'jsr:@std/assert';
import { buildCoreBundle } from '../src/collector/build-collector.ts';

Deno.test('core bundle exports the backend surface and merges correctly', async () => {
  await buildCoreBundle();
  const m = await import('../src/core-bundle/download-name.gen.js');
  assertEquals(typeof m.buildDownloadFilename, 'function');
  assertEquals(typeof m.mergeHistory, 'function');
  assertEquals(typeof m.partitionByDownloaded, 'function');
  assert(m.SrcKeySet);
  const merged = m.mergeHistory([], [{ src: 'https://x/a.jpg', time: 2 }, { src: 'https://x/a.jpg', time: 5 }]);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].time, 5);
  assertEquals(m.SrcKeySet.from(['https://x/a.jpg?sig=1']).has('https://x/a.jpg?sig=2'), true);
});
