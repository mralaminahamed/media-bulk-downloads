import { assertEquals } from 'jsr:@std/assert';
import { createMediaStore } from '../../src/server/media-store.ts';

Deno.test('merge dedups by canonical key and returns only the newly added', () => {
  const s = createMediaStore();
  const a = s.merge([{ src: 'https://x/a.jpg?utm=1', kind: 'image' }]);
  assertEquals(a.length, 1);
  const b = s.merge([{ src: 'https://x/a.jpg?utm=2', kind: 'image' }, { src: 'https://x/b.jpg', kind: 'image' }]);
  assertEquals(b.map((i) => i.src), ['https://x/b.jpg']);   // a.jpg folded (same canonical key)
  assertEquals(s.list().length, 2);
});
