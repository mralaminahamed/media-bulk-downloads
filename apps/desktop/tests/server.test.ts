import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { startServer } from '../src/server/server.ts';

const assets = { '/': { body: '<div id="root">__MBD_TOKEN__</div>', type: 'text/html; charset=utf-8' } };

Deno.test('serves index with token injected', async () => {
  const s = await startServer({ assets, api: {} });
  const res = await fetch(`http://127.0.0.1:${s.port}/`);
  const html = await res.text();
  assertStringIncludes(html, s.token);          // placeholder replaced
  await s.close();
});

Deno.test('api requires the token', async () => {
  const s = await startServer({ assets, api: { 'GET /api/ok': () => new Response('yes') } });
  const noTok = await fetch(`http://127.0.0.1:${s.port}/api/ok`);
  assertEquals(noTok.status, 401);
  await noTok.body?.cancel();
  const withTok = await fetch(`http://127.0.0.1:${s.port}/api/ok`, { headers: { 'x-mbd-token': s.token } });
  assertEquals(withTok.status, 200);
  assertEquals(await withTok.text(), 'yes');
  await s.close();
});

Deno.test('unknown route 404s', async () => {
  const s = await startServer({ assets, api: {} });
  const res = await fetch(`http://127.0.0.1:${s.port}/api/nope`, { headers: { 'x-mbd-token': s.token } });
  assertEquals(res.status, 404);
  await res.body?.cancel();
  await s.close();
});
