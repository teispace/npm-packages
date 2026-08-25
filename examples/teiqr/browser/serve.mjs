#!/usr/bin/env node
/**
 * A static server for the browser demo, using nothing but Node.
 *
 * ES modules will not load over `file://`, so the page needs to be served —
 * and pulling in a dev server for that would rather undercut the point of a
 * dependency-free package.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname === '/' ? '/examples/teiqr/browser/index.html' : url.pathname;

  // Resolve inside the repository root and nowhere else.
  const target = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(root)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(port, () => {
  console.log(`teiqr browser demo:  http://localhost:${port}/`);
  console.log('Camera scanning needs localhost or HTTPS; localhost counts.');
});
