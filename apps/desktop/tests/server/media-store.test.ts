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

Deno.test('merge preserves widened fields (width/height/fileSize/type) through list', () => {
  const s = createMediaStore();
  s.merge([{ src: 'https://x/c.jpg', kind: 'image', width: 800, height: 600, fileSize: 1234, type: 'jpeg' }]);
  const item = s.list()[0];
  assertEquals(item.width, 800);
  assertEquals(item.height, 600);
  assertEquals(item.fileSize, 1234);
  assertEquals(item.type, 'jpeg');
});
