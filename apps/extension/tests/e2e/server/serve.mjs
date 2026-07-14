// Minimal static server for the e2e fixture pages. No dependency — Playwright's
// `webServer` launches this and waits for the port.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const pagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const port = Number(process.env.E2E_PORT) || 5199;

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const rel = pathname === '/' ? '/media.html' : pathname;
    // Keep the read inside pagesDir (no traversal).
    const file = normalize(join(pagesDir, rel));
    if (!file.startsWith(pagesDir)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`e2e fixtures on http://localhost:${port}`));
