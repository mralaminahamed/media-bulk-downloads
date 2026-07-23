import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { buildDashboard } from '../src/dashboard/build-dashboard.ts';
import { DASHBOARD_ASSETS } from '../src/dashboard/assets.generated.ts';

Deno.test('dashboard build emits an index and JS bundle', async () => {
  await buildDashboard();
  assertStringIncludes(DASHBOARD_ASSETS['/'].body, '<div id="root"');
  assertEquals(DASHBOARD_ASSETS['/'].type, 'text/html; charset=utf-8');
  const jsKeys = Object.keys(DASHBOARD_ASSETS).filter((k) => k.endsWith('.js'));
  assertEquals(jsKeys.length >= 1, true);
});
