import { assertEquals } from 'jsr:@std/assert';
import { buildStreamBundle } from '../../src/core-bundle/stream.build.ts';

// A real capture needs network — deferred to the phase-end live smoke. This
// proves the bundle LOADS + is callable under Deno (mp4box + the ssrf-guard +
// bounded-fetch are all pulled in transitively via hls.ts/hls-webcrypto.ts),
// mirroring core-bundle.test.ts's approach for download-name.gen.js.
Deno.test('stream bundle exposes captureHls + browserHlsDeps callable under Deno', async () => {
  await buildStreamBundle();
  const m = await import('../../src/core-bundle/stream.gen.js');
  assertEquals(typeof m.captureHls, 'function');
  assertEquals(typeof m.browserHlsDeps, 'function');
  assertEquals(typeof m.webcryptoDecrypt, 'function');
  const d = m.browserHlsDeps();
  assertEquals(typeof d.fetchText, 'function');
  assertEquals(typeof d.fetchBytes, 'function');
  assertEquals(typeof d.decrypt, 'function');
});
