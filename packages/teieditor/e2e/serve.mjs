// Serves e2e/.out under the strictest policy the editor promises to work in:
// no inline script or style, no eval, Trusted Types enforced.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';

const root = new URL('./.out/', import.meta.url);
const port = Number(process.env.PORT ?? 3119);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  // blob: for an upload's preview, which shows while the file uploads.
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  // `e2e` is the harness's own, for building copy sources in tests.
  'trusted-types teieditor e2e',
].join('; ');

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  try {
    const body = await readFile(new URL(file, root));
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1');
