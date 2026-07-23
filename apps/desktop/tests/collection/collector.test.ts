import { assert, assertEquals } from 'jsr:@std/assert';
import { DOMParser } from 'jsr:@b-fuze/deno-dom';
import { buildCollector } from '../../src/build/collector.ts';

Deno.test('collector IIFE exposes __mbdCollect and finds an image', async () => {
  await buildCollector();
  const code = await Deno.readTextFile(new URL('../../dist/collector.iife.js', import.meta.url));
  const doc = new DOMParser().parseFromString(
    `<img src="https://example.com/a.jpg" width="800" height="600">`,
    'text/html',
  );
  const noStyle = { getPropertyValue: () => '' };
  const g = {
    document: doc,
    location: {
      href: 'https://example.com/',
      origin: 'https://example.com',
      hostname: 'example.com',
      pathname: '/',
    },
    getComputedStyle: () => noStyle,
  } as unknown as typeof globalThis;
  new Function('globalThis', 'window', 'document', 'location', `${code}\nreturn globalThis.__mbdCollect;`)(
    g, g, doc, g.location,
  );
  const fn = (g as unknown as { __mbdCollect: (o?: unknown) => Array<{ src: string }> }).__mbdCollect;
  assertEquals(typeof fn, 'function');
  const items = fn();
  assert(items.some((i) => i.src === 'https://example.com/a.jpg'), 'image should be collected');
});
