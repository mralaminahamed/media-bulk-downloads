import { assert, assertEquals } from 'jsr:@std/assert';
import type { HlsCaptureResult } from '../../src/core-bundle/stream.gen.d.ts';
import { captureStream } from '../../src/platform/capture.ts';

const fakeCapture = (_manifestUrl: string, _deps: unknown, _opts: unknown): Promise<HlsCaptureResult> =>
  Promise.resolve({
    bytes: new Uint8Array([1, 2, 3]),
    ext: 'mp4',
    mime: 'video/mp4',
    segmentCount: 2,
    durationSec: 4,
  });

Deno.test('captureStream writes the muxed bytes to a .mp4 file under root', async () => {
  const root = await Deno.makeTempDir();

  const { path, ext, bytes } = await captureStream(
    { src: 'https://ex.com/v.m3u8', hlsManifest: 'https://ex.com/v.m3u8', sourcePage: { url: 'https://ex.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );

  assert(path.endsWith('.mp4'), `expected a .mp4 file, got ${path}`);
  assert(path.startsWith(root), `path escaped root: ${path}`);
  assertEquals(ext, 'mp4');
  assertEquals(bytes, 3);

  const written = await Deno.readFile(path);
  assertEquals(written.length, 3);
  assertEquals(Array.from(written), [1, 2, 3]);
});

Deno.test('captureStream cannot escape root via a crafted source page URL', async () => {
  const root = await Deno.makeTempDir();

  const { path } = await captureStream(
    {
      src: 'https://ex.com/../../etc/v.m3u8',
      hlsManifest: 'https://ex.com/v.m3u8',
      sourcePage: { url: 'https://ex.com/../../../evil' },
    },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );

  assert(path.startsWith(root), `path escaped root: ${path}`);
});
