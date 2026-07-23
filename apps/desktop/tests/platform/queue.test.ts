import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../../src/storage/kv.ts';
import { loadHistory } from '../../src/storage/history.ts';
import { createQueue } from '../../src/platform/queue.ts';

Deno.test('queue downloads all with concurrency, retries once, records history', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  const calls: string[] = [];
  let failFirst = true;
  const downloadImpl = (item: { src: string }) => {
    calls.push(item.src);
    if (item.src === 'https://x/b.jpg' && failFirst) { failFirst = false; return Promise.reject(new Error('boom')); }
    return Promise.resolve({ path: `/out/${item.src.split('/').pop()}` });
  };
  const q = createQueue({
    store,
    root: '/out',
    settings: () => ({ downloadPath: '', namingMode: 'prefixed', fileNamePrefix: 'image_', downloadConcurrency: 2 }),
    downloadImpl: downloadImpl as never,
    backoffMs: () => 0,
  });
  await q.enqueue([{ src: 'https://x/a.jpg' }, { src: 'https://x/b.jpg' }]);
  await q.drain();
  assertEquals(q.status().done, 2);
  assertEquals(q.status().failed, 0);
  assertEquals(calls.filter((s) => s === 'https://x/b.jpg').length, 2); // one retry
  assertEquals((await loadHistory(store)).length, 2);                    // both recorded
  store.close();
});

Deno.test('queue reads settings live from the getter, not a snapshot at construction', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  const s = { downloadPath: '{domain}', namingMode: 'prefixed' as const, fileNamePrefix: 'a_', downloadConcurrency: 1 };
  const capturedOpts: Array<{ template: string; fileNamePrefix: string }> = [];
  const downloadImpl = (item: { src: string }, opts: { template: string; fileNamePrefix: string }) => {
    capturedOpts.push({ template: opts.template, fileNamePrefix: opts.fileNamePrefix });
    return Promise.resolve({ path: `/out/${item.src.split('/').pop()}` });
  };
  const q = createQueue({
    store, root: '/out', settings: () => s, downloadImpl: downloadImpl as never, backoffMs: () => 0,
  });

  await q.enqueue([{ src: 'https://x/a.jpg' }]);
  await q.drain();
  assertEquals(capturedOpts[0]?.fileNamePrefix, 'a_');

  s.fileNamePrefix = 'b_';
  await q.enqueue([{ src: 'https://x/c.jpg' }]);
  await q.drain();
  assertEquals(capturedOpts[1]?.fileNamePrefix, 'b_');

  store.close();
});
