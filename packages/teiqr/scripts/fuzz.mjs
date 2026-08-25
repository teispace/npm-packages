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
const { decodePng } = await import('${dist}/raster.js');
const { tryScan, decodeMatrix, decodeMicroMatrix, decodeRmqrMatrix } = await import('${dist}/verify.js');
const { parsePayload } = await import('${dist}/payload.js');
const { qr } = await import('${dist}/index.js');

let state = Number(process.argv[2]) >>> 0 || 1;
const rand = () => {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
const int = (n) => Math.floor(rand() * n);

// A real PNG to mutate, which finds far more than random bytes alone: most
// random buffers are rejected at the signature and never reach the decoder.
const seed = qr('fuzz corpus seed ' + int(1000)).png({ scale: int(6) + 2 });

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
  attempt(() => tryScan(mutate(seed)));
  attempt(() => tryScan(truncate(seed)));
  attempt(() => tryScan(signed()));
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
