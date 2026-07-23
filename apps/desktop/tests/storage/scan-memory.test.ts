import { assertEquals } from 'jsr:@std/assert';
import { openStore } from '../../src/storage/kv.ts';
import { loadScanMemory, saveScanMemory } from '../../src/storage/scan-memory.ts';
import { evictToCap } from '../../src/core-bundle/download-name.gen.js';

Deno.test('saves then loads a host, stamping updatedAt from now (first save = clamped sample)', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await saveScanMemory(store, 'example.com', { settleMs: 800, scrolls: 20 }, 1000);
  assertEquals(await loadScanMemory(store, 'example.com'), { settleMs: 800, scrolls: 20, updatedAt: 1000 });
  store.close();
});

Deno.test('cross-visit EMA blends toward the new sample on the second save', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await saveScanMemory(store, 'example.com', { settleMs: 400, scrolls: 10 }, 1000);
  await saveScanMemory(store, 'example.com', { settleMs: 900, scrolls: 25 }, 2000);
  const mem = await loadScanMemory(store, 'example.com');
  assertEquals(mem, { settleMs: 650, scrolls: 18, updatedAt: 2000 });
  store.close();
});

Deno.test('loadScanMemory returns null for an unknown host', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await saveScanMemory(store, 'example.com', { settleMs: 400, scrolls: 10 }, 1000);
  assertEquals(await loadScanMemory(store, 'unknown.com'), null);
  store.close();
});

Deno.test('eviction (core evictToCap) drops the oldest host by updatedAt over the cap', () => {
  const record: Record<string, { settleMs: number; scrolls: number; updatedAt: number }> = {};
  for (let i = 0; i < 205; i++) {
    record[`host${i}.com`] = { settleMs: 1, scrolls: 1, updatedAt: i };
  }
  const evicted = evictToCap(record);
  assertEquals(Object.keys(evicted).length, 200);
  assertEquals('host0.com' in evicted, false);
  assertEquals('host204.com' in evicted, true);
});
