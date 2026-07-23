import { assert, assertEquals } from 'jsr:@std/assert';
import { downloadOne } from '../src/platform/downloader.ts';

Deno.test('downloadOne writes fetched bytes under the expanded template path', async () => {
  const root = await Deno.makeTempDir();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const fetchImpl = ((_url: string) =>
    Promise.resolve(new Response(bytes))) as unknown as typeof fetch;

  const { path } = await downloadOne(
    { src: 'https://www.twitter.com/img.jpg', ext: 'jpg' },
    { root, template: '{domain}', index: 1, sourcePageUrl: 'https://www.twitter.com/x', fetchImpl },
  );

  assert(path.includes('twitter.com'), `expected domain folder, got ${path}`);
  const written = await Deno.readFile(path);
  assertEquals(Array.from(written), [1, 2, 3, 4]);
});

Deno.test('downloadOne cannot escape the root via a crafted template', async () => {
  const root = await Deno.makeTempDir();
  const fetchImpl = (() => Promise.resolve(new Response(new Uint8Array([0])))) as unknown as typeof fetch;
  const { path } = await downloadOne(
    { src: 'https://h/a.jpg', ext: 'jpg' },
    { root, template: '../../etc', index: 1, fetchImpl },
  );
  assert(path.startsWith(root), `path escaped root: ${path}`);
});
