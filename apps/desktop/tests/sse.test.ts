import { assertEquals } from 'jsr:@std/assert';
import { createSseHub } from '../src/server/sse.ts';

Deno.test('broadcast reaches a connected client', async () => {
  const hub = createSseHub();
  const res = hub.handler(new Request('http://x/events'));
  const reader = res.body!.getReader();
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(hub.clientCount(), 1);
  hub.broadcast('ping', { n: 1 });
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assertEquals(text.includes('event: ping'), true);
  assertEquals(text.includes('"n":1'), true);
  await reader.cancel();
});
