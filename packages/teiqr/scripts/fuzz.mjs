#!/usr/bin/env node
/**
 * Throw malformed input at the decoders until something breaks.
 *
 *     yarn build && node scripts/fuzz.mjs [--seconds 60] [--seed 1]
 *
 * The hand-written cases in `__tests__/malformed-input.test.ts` cover the
 * failures someone thought of. This covers the ones nobody did — which is the
 * category the PNG hang belonged to, and it would have surfaced that bug in
 * seconds without anyone needing to guess at it first.
 *
 * ### Why a child process
 * The failure mode being hunted is a **hang**, and a hang cannot be caught by a
 * `try`/`catch` or interrupted by a test runner: a synchronous infinite loop
 * never yields. Each batch therefore runs in its own process under a wall-clock
 * timeout, and a batch killed by that timeout is the signal. It costs a process
 * spawn per batch, which is exactly the price of being able to detect the thing
 * that matters most.
 *
 * ### Determinism
 * Every input is derived from a seed, and the seed of a failing batch is
 * printed. A failure is reproducible with `--seed N --only`, which matters
 * because "the fuzzer found something once" is not a bug report.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = `file://${join(dirname(here), 'dist')}`;

const fixtures = join(dirname(here), '__tests__', 'fixtures', 'jpeg');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const seconds = flag('seconds', 30);
const startSeed = flag('seed', 1);
const only = args.includes('--only');

/**
 * The worker: builds inputs from a seed and feeds them to every decoder.
 *
 * Written as a string because it has to run in a separate process, and
 * inlining it keeps the generator and the runner from drifting apart.
 */
const worker = `
const { decodePng, zlibDeflate } = await import('${dist}/raster.js');
const { tryScan, decodeMatrix, decodeMicroMatrix, decodeRmqrMatrix } = await import('${dist}/verify.js');
const { parsePayload } = await import('${dist}/payload.js');
const { qr } = await import('${dist}/index.js');
const { decodeJpeg } = await import('${dist}/jpeg.js');
const { readFileSync } = await import('node:fs');

let state = Number(process.argv[2]) >>> 0 || 1;
const rand = () => {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
const int = (n) => Math.floor(rand() * n);

// A real PNG to mutate, which finds far more than random bytes alone: most
// random buffers are rejected at the signature and never reach the decoder.
const seed = qr('fuzz corpus seed ' + int(1000)).png({ scale: int(6) + 2 });

// The seed above is 8-bit RGBA, because that is all this package writes. Left
// at that, mutation would almost never reach the greyscale, palette, sub-byte
// or interlaced paths the decoder also has to handle — a random byte flip
// lands on the colour-type field rarely, and lands on a *valid* combination
// rarer still. So the corpus is widened deliberately: the same image, re-encoded
// into the formats other people's encoders produce, and mutated alongside it.
const { pixels, width, height } = qr('fuzz corpus variant ' + int(1000)).pixels({ scale: 3 });
const CRC = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => {
  const body = [...type].map((c) => c.charCodeAt(0)).concat(Array.from(data));
  return [...be32(body.length - 4), ...body, ...be32(crc32(Uint8Array.from(body)))];
};
const ADAM7 = [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const reencode = (depth, colour, interlace) => {
  const channels = CHANNELS[colour];
  const max = depth === 16 ? 0xffff : (1 << depth) - 1;
  const light = (x, y) => pixels[(y * width + x) * 4] > 127;
  const sample = (x, y) => {
    const on = light(x, y);
    if (colour === 3) return [on ? 1 : 0];
    if (colour === 0) return [on ? max : 0];
    if (colour === 4) return [on ? max : 0, max];
    if (colour === 2) return on ? [max, max, max] : [0, 0, 0];
    return on ? [max, max, max, max] : [0, 0, 0, max];
  };
  const raw = [];
  for (const [xs, ys, xstep, ystep] of interlace ? ADAM7 : [[0, 0, 1, 1]]) {
    const wide = Math.ceil((width - xs) / xstep);
    const rows = Math.ceil((height - ys) / ystep);
    if (wide <= 0 || rows <= 0) continue;
    const stride = Math.ceil((depth * channels * wide) / 8);
    for (let r = 0; r < rows; r++) {
      const line = new Uint8Array(stride);
      for (let c = 0; c < wide; c++) {
        const values = sample(xs + c * xstep, ys + r * ystep);
        for (let k = 0; k < channels; k++) {
          const index = c * channels + k;
          const v = values[k];
          if (depth === 16) { line[index * 2] = (v >> 8) & 255; line[index * 2 + 1] = v & 255; }
          else if (depth === 8) line[index] = v & 255;
          else { const bit = index * depth; line[bit >> 3] |= (v & max) << (8 - depth - (bit & 7)); }
        }
      }
      raw.push(0, ...line);
    }
  }
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...be32(width), ...be32(height), depth, colour, 0, 0, interlace ? 1 : 0]),
    ...(colour === 3 ? chunk('PLTE', [0, 0, 0, 255, 255, 255]) : []),
    ...(int(3) === 0 ? chunk('tRNS', colour === 3 ? [255, int(256)] : colour === 0 ? [0, 0] : colour === 2 ? [0,0,0,0,0,0] : []) : []),
    ...chunk('IDAT', zlibDeflate(Uint8Array.from(raw))),
    ...chunk('IEND', []),
  ]);
};

const VARIANTS = [
  [1, 0, false], [2, 0, false], [4, 0, false], [8, 0, false], [16, 0, false],
  [1, 3, false], [2, 3, false], [4, 3, false], [8, 3, false],
  [8, 2, false], [16, 2, false], [8, 4, false], [16, 4, false], [8, 6, false], [16, 6, false],
  [8, 0, true], [1, 3, true], [4, 3, true], [8, 6, true], [16, 2, true],
];
// Built eagerly and checked, not wrapped in a try/catch that quietly falls back
// to the RGBA seed. A corpus that failed to build is a fuzzer testing less than
// it claims, and the whole point of these variants is the paths they reach — so
// a variant that does not decode cleanly is a crash here rather than a silent
// downgrade to the coverage this was written to escape.
const corpus = VARIANTS.map(([d, c, i]) => {
  const bytes = reencode(d, c, i);
  const image = decodePng(bytes);
  if (image.width !== width || image.height !== height) {
    throw new Error('fuzz corpus variant ' + d + '/' + c + '/' + i + ' decoded to the wrong size');
  }
  return bytes;
});
const pick = () => corpus[int(corpus.length)];

// JPEG is a second entropy-coded format reached from the same public entry,
// and its Huffman walk is exactly the shape that hung the PNG inflater: a loop
// consuming bits that a reader running past the end could feed forever. The
// fixtures are real files from an independent encoder, so mutating them reaches
// header fields and entropy data no synthetic buffer would.
const JPEGS = ['qr-444.jpg', 'qr-420.jpg', 'qr-low.jpg', 'qr-gray.jpg'];
const jpegCorpus = JPEGS.map((name) => {
  const bytes = new Uint8Array(readFileSync('${fixtures}/' + name));
  const image = decodeJpeg(bytes);
  if (!image.width || !image.height) throw new Error('fuzz JPEG corpus ' + name + ' decoded empty');
  return bytes;
});
const pickJpeg = () => jpegCorpus[int(jpegCorpus.length)];

const mutate = (bytes) => {
  const copy = Uint8Array.from(bytes);
  const edits = 1 + int(8);
  for (let i = 0; i < edits; i++) {
    const kind = int(4);
    const at = int(copy.length);
    if (kind === 0) copy[at] = int(256);
    else if (kind === 1) copy[at] ^= 1 << int(8);
    else if (kind === 2) copy[at] = 0;
    else copy[at] = 255;
  }
  return copy;
};

const truncate = (bytes) => bytes.subarray(0, int(bytes.length) + 1);
const garbage = () => { const n = int(4096); const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = int(256); return b; };
const signed = () => { const g = garbage(); const b = new Uint8Array(8 + g.length); b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]); b.set(g, 8); return b; };
const text = () => {
  const alphabet = ['WIFI:', 'BEGIN:VCARD', 'MECARD:', 'geo:', 'mailto:', 'https://', 'tel:', ';', ':', '\\\\', '"', '\\n', 'A', '0', '\\u00e9', '\\ud83d\\ude00'];
  let s = '';
  const parts = int(200);
  for (let i = 0; i < parts; i++) s += alphabet[int(alphabet.length)].repeat(1 + int(20));
  return s;
};
const matrix = (size) => { const m = new Uint8Array(size * size); for (let i = 0; i < m.length; i++) m[i] = int(2); return m; };

const attempt = (fn) => { try { fn(); } catch { /* throwing is a valid outcome; hanging is not */ } };

for (let round = 0; round < 250; round++) {
  attempt(() => decodePng(mutate(seed)));
  attempt(() => decodePng(truncate(seed)));
  attempt(() => decodePng(truncate(mutate(seed))));
  attempt(() => decodePng(signed()));
  attempt(() => decodePng(garbage()));
  attempt(() => decodePng(mutate(pick())));
  attempt(() => decodePng(truncate(pick())));
  attempt(() => decodePng(truncate(mutate(pick()))));
  attempt(() => tryScan(mutate(seed)));
  attempt(() => tryScan(truncate(seed)));
  attempt(() => tryScan(mutate(pick())));
  attempt(() => tryScan(signed()));
  attempt(() => decodeJpeg(mutate(pickJpeg())));
  attempt(() => decodeJpeg(truncate(pickJpeg())));
  attempt(() => decodeJpeg(truncate(mutate(pickJpeg()))));
  attempt(() => decodeJpeg(garbage()));
  attempt(() => tryScan(mutate(pickJpeg())));
  attempt(() => parsePayload(text()));
  const size = [11, 13, 15, 17, 21, 25, 29][int(7)];
  attempt(() => decodeMatrix({ size, version: (size - 17) / 4 || 1, modules: matrix(size), kinds: new Uint8Array(size * size) }));
  attempt(() => decodeMicroMatrix({ size, modules: matrix(size) }));
  attempt(() => decodeRmqrMatrix({ modules: matrix(size), width: size, height: 7 }));
}
console.log('batch ok');
`;

const runBatch = (seed) => {
  const started = Date.now();
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', worker, '--', String(seed)], {
    timeout: 30_000,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  const elapsed = Date.now() - started;

  if (result.signal === 'SIGTERM') {
    return { ok: false, reason: `HANG — batch did not finish in 30s`, elapsed };
  }
  if (result.status !== 0) {
    // An uncaught throw escaped every `attempt`, which means it came from
    // somewhere the harness did not wrap — worth seeing.
    return { ok: false, reason: `CRASH — ${result.stderr.trim().split('\n')[0]}`, elapsed };
  }
  return { ok: true, elapsed };
};

console.log(`fuzzing decoders for ~${seconds}s from seed ${startSeed}\n`);

const deadline = Date.now() + seconds * 1000;
let seed = startSeed;
let batches = 0;
let failures = 0;

do {
  const result = runBatch(seed);
  batches++;
  if (result.ok) {
    process.stdout.write(`  seed ${String(seed).padEnd(6)} ok    ${result.elapsed}ms\n`);
  } else {
    failures++;
    process.stdout.write(`  seed ${String(seed).padEnd(6)} ${result.reason}\n`);
    console.error(`\nReproduce with:  node scripts/fuzz.mjs --seed ${seed} --only\n`);
  }
  seed++;
} while (!only && Date.now() < deadline);

console.log(`\n${batches} batch${batches === 1 ? '' : 'es'}, ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures > 0 ? 1 : 0);
