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

Deno.test('captureStream gives two captures from the same host distinct filenames', async () => {
  const root = await Deno.makeTempDir();

  const first = await captureStream(
    { src: 'https://ex.com/alpha.m3u8', hlsManifest: 'https://ex.com/alpha.m3u8', sourcePage: { url: 'https://ex.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );
  const second = await captureStream(
    { src: 'https://ex.com/bravo.m3u8', hlsManifest: 'https://ex.com/bravo.m3u8', sourcePage: { url: 'https://ex.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );

  assert(first.path !== second.path, `two captures collided on one filename: ${first.path}`);
  assert(first.path.startsWith(root) && second.path.startsWith(root));

  const [a, b] = await Promise.all([Deno.readFile(first.path), Deno.readFile(second.path)]);
  assertEquals(a.length, 3);
  assertEquals(b.length, 3);
});

Deno.test('captureStream gives two captures with the SAME manifest basename (different hosts) distinct filenames', async () => {
  const root = await Deno.makeTempDir();

  const first = await captureStream(
    { src: 'https://a.com/x/playlist.m3u8', hlsManifest: 'https://a.com/x/playlist.m3u8', sourcePage: { url: 'https://a.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );
  await new Promise((r) => setTimeout(r, 5));
  const second = await captureStream(
    { src: 'https://b.com/y/playlist.m3u8', hlsManifest: 'https://b.com/y/playlist.m3u8', sourcePage: { url: 'https://b.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );

  assert(
    first.path !== second.path,
    `two captures with the identical manifest basename "playlist.m3u8" collided: ${first.path}`,
  );
  assert(first.path.includes('playlist') && second.path.includes('playlist'), 'expected the basename slug to remain for readability');
  assert(first.path.startsWith(root) && second.path.startsWith(root));

  const [a, b] = await Promise.all([Deno.readFile(first.path), Deno.readFile(second.path)]);
  assertEquals(a.length, 3);
  assertEquals(b.length, 3);
});

Deno.test('captureStream still names the file uniquely when the manifest URL has no usable basename', async () => {
  const root = await Deno.makeTempDir();

  const first = await captureStream(
    { src: 'https://ex.com/', hlsManifest: 'https://ex.com/', sourcePage: { url: 'https://ex.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );
  await new Promise((r) => setTimeout(r, 5));
  const second = await captureStream(
    { src: 'https://ex.com/', hlsManifest: 'https://ex.com/', sourcePage: { url: 'https://ex.com/watch' } },
    { root, quality: 'highest', captureImpl: fakeCapture as never },
  );

  assert(first.path !== second.path, `two captures collided on one filename: ${first.path}`);
});
