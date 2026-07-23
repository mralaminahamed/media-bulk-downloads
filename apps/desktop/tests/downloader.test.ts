import { assert, assertEquals } from 'jsr:@std/assert';
import { basename } from 'jsr:@std/path';
import { downloadOne } from '../src/platform/downloader.ts';

Deno.test('downloadOne writes fetched bytes under the expanded template path', async () => {
  const root = await Deno.makeTempDir();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const fetchImpl = ((_url: string) =>
    Promise.resolve(new Response(bytes))) as unknown as typeof fetch;

  const { path } = await downloadOne(
    { src: 'https://www.twitter.com/img.jpg', ext: 'jpg' },
    { root, template: '{domain}', index: 0, sourcePageUrl: 'https://www.twitter.com/x', fetchImpl },
  );

  assert(path.includes('twitter.com'), `expected domain folder, got ${path}`);
  assertEquals(basename(path), 'image_1.jpg', `index 0 should name the first file image_1.jpg, got ${path}`);
  const written = await Deno.readFile(path);
  assertEquals(Array.from(written), [1, 2, 3, 4]);
});

Deno.test('downloadOne derives the domain folder from item.sourcePage.url when opts.sourcePageUrl is absent', async () => {
  const root = await Deno.makeTempDir();
  const fetchImpl = (() => Promise.resolve(new Response(new Uint8Array([9])))) as unknown as typeof fetch;

  const { path } = await downloadOne(
    { src: 'https://cdn.example.com/img.jpg', ext: 'jpg', sourcePage: { url: 'https://www.pinterest.com/pin/1' } },
    { root, template: '{domain}', index: 0, fetchImpl },
  );

  assert(path.includes('pinterest.com'), `expected item.sourcePage.url to drive the domain folder, got ${path}`);
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
