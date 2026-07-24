import { assertStringIncludes } from 'jsr:@std/assert';
import { DASHBOARD_ASSETS } from '../../src/generated/dashboard-assets.ts';

// The laufey webview drops the query string on navigate, so the server-minted
// session token cannot ride in `?token=…`. The token is embedded into the HTML
// shell instead (server.ts replaces `__MBD_TOKEN__`), which only works if the
// built shell actually carries the placeholder. Guard that it does.
Deno.test('built dashboard shell carries the token placeholder', () => {
  const shell = DASHBOARD_ASSETS['/'];
  assertStringIncludes(shell.body, '__MBD_TOKEN__');
});
