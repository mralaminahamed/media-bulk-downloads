import type { ServerHandle, StartServerOpts } from './types.ts';

export function makeToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Match "GET /api/foo/:id" patterns against a concrete path; returns the handler
// key and params, or null.
function matchRoute(api: Record<string, unknown>, method: string, path: string): string | null {
  for (const key of Object.keys(api)) {
    const [m, pat] = key.split(' ');
    if (m !== method) continue;
    const ps = pat.split('/'), cs = path.split('/');
    if (ps.length !== cs.length) continue;
    if (ps.every((seg, i) => seg.startsWith(':') || seg === cs[i])) return key;
  }
  return null;
}

export function startServer(opts: StartServerOpts): Promise<ServerHandle> {
  const token = makeToken();
  const ac = new AbortController();
  return new Promise((resolve) => {
    const server = Deno.serve({
      hostname: '127.0.0.1',
      port: opts.port ?? 0,
      signal: ac.signal,
      onListen: ({ port }) => {
        resolve({ port, token, close: async () => { ac.abort(); await server.finished; } });
      },
    }, (req) => {
      const url = new URL(req.url);
      const { pathname } = url;
      // Static assets (no token needed to load the shell; token is embedded in it).
      if (!pathname.startsWith('/api/') && pathname !== '/events') {
        const asset = opts.assets[pathname] ?? opts.assets['/'];
        if (!asset) return new Response('not found', { status: 404 });
        const body = pathname === '/' || pathname === '' ? asset.body.replaceAll('__MBD_TOKEN__', token) : asset.body;
        return new Response(body, { headers: { 'content-type': asset.type } });
      }
      // Token guard for /api + /events.
      const supplied = req.headers.get('x-mbd-token') ?? url.searchParams.get('token');
      if (supplied !== token) return new Response('unauthorized', { status: 401 });
      if (pathname === '/events' && opts.sse) return opts.sse(req, url);
      const key = matchRoute(opts.api, req.method, pathname);
      if (!key) return new Response('not found', { status: 404 });
      return opts.api[key](req, url);
    });
  });
}
