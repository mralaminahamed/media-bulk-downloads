import { assert } from 'jsr:@std/assert';
import { buildDeepScan } from '../../src/collector/deepscan.build.ts';

// The deep-scan loop's DOM driver (`waitForQuiet`) depends on `MutationObserver`,
// which Deno's global scope (and deno-dom) don't provide — so, unlike the
// collector IIFE test, a DOM shim can't drive a real scroll round here. The loop
// itself is covered by @mbd/core's `runDeepScan` unit tests (pure, deps-injected)
// and by the Task 5 live smoke against a real browser; this test only asserts the
// bundle exists and exposes the expected surface.
Deno.test('deep-scan IIFE bundles and exposes __mbdDeepScan (reusing core runDeepScan)', async () => {
  await buildDeepScan();
  const code = await Deno.readTextFile(new URL('../../dist/deepscan.iife.js', import.meta.url));
  assert(code.length > 0, 'bundle should be non-empty');
  assert(code.includes('__mbdDeepScan'), 'bundle should define globalThis.__mbdDeepScan');
  assert(code.includes('runDeepScan'), 'bundle should inline @mbd/core runDeepScan');
});
