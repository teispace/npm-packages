/**
 * On a server, and on the edge.
 *
 * Nothing here touches a canvas or a filesystem, which is why the same handler
 * works in Node, a Cloudflare Worker, Deno Deploy and Bun. That is not an
 * incidental property — it is why the PNG codec and DEFLATE are written from
 * scratch inside the package rather than delegated.
 */
import { qr, scan, tryScan } from 'teiqr';
import { exportQr } from 'teiqr/export';
import { encode } from 'teiqr/core';
import { check, section } from './_shared.mjs';

/**
 * A `fetch` handler, in the shape every edge runtime expects.
 *
 * `GET /qr?text=…&scale=…` renders, `POST /scan` with an image body decodes.
 */
const handler = async (request) => {
  const url = new URL(request.url);

  if (url.pathname === '/qr') {
    const text = url.searchParams.get('text');
    if (!text) return new Response('missing ?text', { status: 400 });

    const scale = Number(url.searchParams.get('scale') ?? 8);
    const format = url.searchParams.get('format') ?? 'png';

    // Everything is synchronous, so there is no await and no streaming dance.
    const { bytes, mime } = exportQr(encode(text), { moduleShape: 'rounded' }, format, { scale });
    return new Response(bytes, {
      headers: { 'content-type': mime, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }

  if (url.pathname === '/scan' && request.method === 'POST') {
    const body = new Uint8Array(await request.arrayBuffer());
    // tryScan rather than scan: a request body is input you did not create,
    // and "no code in this image" is an ordinary answer rather than a fault.
    const result = tryScan(body);
    return result
      ? Response.json({ text: result.text, version: result.version, ecc: result.ecc })
      : Response.json({ error: 'no QR code found' }, { status: 422 });
  }

  return new Response('not found', { status: 404 });
};

section('GET /qr?text=…');
const png = await handler(new Request('https://edge.example/qr?text=hello%20edge&scale=6'));
console.log(`    ${png.status} ${png.headers.get('content-type')}`);
const pngBytes = new Uint8Array(await png.arrayBuffer());
console.log(`    ${pngBytes.length.toLocaleString()} bytes`);
check(scan(pngBytes).text === 'hello edge', 'the served PNG should scan');

section('GET /qr?format=svg');
const svg = await handler(new Request('https://edge.example/qr?text=vector&format=svg'));
console.log(`    ${svg.status} ${svg.headers.get('content-type')}`);

section('POST /scan');
const posted = await handler(
  new Request('https://edge.example/scan', { method: 'POST', body: qr('round trip').png({ scale: 6 }) }),
);
console.log(`    ${posted.status} ${JSON.stringify(await posted.json())}`);

section('POST /scan with something that is not a code');
const empty = await handler(
  new Request('https://edge.example/scan', {
    method: 'POST',
    body: new Uint8Array(100 * 100 * 4).fill(255),
  }),
);
console.log(`    ${empty.status} ${JSON.stringify(await empty.json())}`);

section('POST /scan with deliberately malformed bytes');
// Worth exercising: this is the path a public endpoint exposes to anyone, and
// a decoder that hangs on a truncated file takes the worker with it.
const hostile = await handler(
  new Request('https://edge.example/scan', {
    method: 'POST',
    body: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }),
);
console.log(`    ${hostile.status} ${JSON.stringify(await hostile.json())} — returned, not hung`);
check(hostile.status === 422, 'malformed input should be rejected cleanly');
