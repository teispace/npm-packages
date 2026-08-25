#!/usr/bin/env node
/**
 * Measure the pipeline.
 *
 *     yarn build && node scripts/benchmark.mjs
 *
 * A script rather than a test, deliberately. Timing assertions in CI are
 * flaky by construction — a shared runner under load will fail a threshold
 * that has nothing to do with the code — and a flaky test gets muted rather
 * than fixed. Run this when a change might have moved something, and paste the
 * numbers into the commit.
 *
 * The camera hook decodes at ten frames a second, so the number that matters
 * most is the scan column: anything approaching 100 ms means dropped frames on
 * the device, whatever it looks like on a laptop.
 */
import { encode } from '../dist/core.js';
import { encodeMicro, encodeRmqr } from '../dist/core.js';
import { toPng } from '../dist/raster.js';
import { decodePng } from '../dist/raster.js';
import { renderSvg } from '../dist/render.js';
import { scan, tryScan } from '../dist/verify.js';
import { decodeJpeg } from '../dist/jpeg.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run `fn` enough times to get a stable figure, and report the median. */
const measure = (label, fn, { warmup = 5, runs = 25 } = {}) => {
  for (let i = 0; i < warmup; i++) fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  samples.sort((a, b) => a - b);
  // Median rather than mean: one GC pause during a run should not decide the
  // headline number.
  return {
    label,
    median: samples[Math.floor(samples.length / 2)],
    best: samples[0],
    worst: samples[samples.length - 1],
  };
};

const rows = [];
const record = (...args) => rows.push(measure(...args));

const SHORT = 'https://example.com';
const LONG = `https://example.com/${'0'.repeat(400)}`;

// --- encoding -------------------------------------------------------------
record('encode, short url (v3)', () => encode(SHORT));
record('encode, 400 digits (v11)', () => encode(LONG));
record('encode, 2000 bytes (v33)', () => encode('x'.repeat(2000)));
record('encode, Micro QR', () => encodeMicro('12345'));
record('encode, rMQR', () => encodeRmqr('SERIAL-4417'));

// --- rendering ------------------------------------------------------------
const small = encode(SHORT);
const large = encode(LONG);
record('render SVG, v3', () => renderSvg(small, { moduleShape: 'rounded' }));
record('render SVG, v11', () => renderSvg(large, { moduleShape: 'rounded' }));
record('rasterise PNG, v3 @8x', () => toPng(small, {}, { scale: 8, background: '#ffffff' }));
record('rasterise PNG, v11 @8x', () => toPng(large, {}, { scale: 8, background: '#ffffff' }));

// --- scanning -------------------------------------------------------------
const pixelsOf = (matrix, scale) => {
  const image = decodePng(toPng(matrix, {}, { scale, background: '#ffffff' }));
  return { data: image.pixels, width: image.width, height: image.height };
};

const smallPixels = pixelsOf(small, 8);
const largePixels = pixelsOf(large, 8);
const microPixels = pixelsOf(encodeMicro('12345'), 10);
const rmqrPixels = pixelsOf(encodeRmqr('SERIAL-4417'), 10);

// A 640x480 frame with the symbol in it, which is what the camera hook
// actually hands over after downscaling.
const frame = (() => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height * 4).fill(255);
  const source = pixelsOf(small, 6);
  const ox = 120;
  const oy = 90;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const from = (y * source.width + x) * 4;
      const to = ((y + oy) * width + x + ox) * 4;
      for (let c = 0; c < 4; c++) data[to + c] = source.data[from + c];
    }
  }
  return { data, width, height };
})();

const empty = { data: new Uint8Array(640 * 480 * 4).fill(255), width: 640, height: 480 };

record('scan, v3 tight crop', () => scan(smallPixels));
record('scan, v11 tight crop', () => scan(largePixels));
record('scan, v3 in a 640x480 frame', () => scan(frame));
record('scan, Micro QR', () => tryScan(microPixels));
record('scan, rMQR', () => tryScan(rmqrPixels));

// A failed scan costs about twice a successful one, because `scan` retries
// with the image inverted before giving up — an inverted symbol produces no
// finder hits at all in the first pass, so there is no cheaper way to detect
// one. It matters here because behind a camera the *failing* case is the
// common one: most frames have nothing in them.
record('reject an empty frame', () => tryScan(empty));
record('reject an empty frame, no invert', () => tryScan(empty, { tryInverted: false }));

// JPEG, against the test fixtures. Worth watching because the inverse DCT is
// the expensive half of a decode — profiling a 4K photograph put it at 65% of
// the time, against 27% for the Huffman pass, which is the opposite of the
// usual assumption. What keeps it affordable is that a quantised block is
// mostly zeros, so `reconstruct` skips zero rows and short-circuits DC-only
// blocks entirely.
//
// Against the whole job it is a smaller share than it looks: decoding a 3 MP
// photograph is about a third of `scan()`, and locating the symbol is the
// rest. A faster IDCT cannot buy back more than that third.
const fixtures = join(dirname(dirname(fileURLToPath(import.meta.url))), '__tests__', 'fixtures', 'jpeg');
const jpegBytes = (name) => new Uint8Array(readFileSync(join(fixtures, name)));
const baselineJpeg = jpegBytes('qr-420.jpg');
const progressiveJpeg = jpegBytes('qr-progressive.jpg');

record('decode JPEG, baseline 4:2:0', () => decodeJpeg(baselineJpeg));
record('decode JPEG, progressive', () => decodeJpeg(progressiveJpeg));
record('scan a baseline JPEG', () => scan(baselineJpeg));

// --- report ---------------------------------------------------------------
const pad = (text, width) => String(text).padEnd(width);
const num = (value) => value.toFixed(2).padStart(8);

console.log(`node ${process.version} · ${process.platform}/${process.arch}\n`);
console.log(`${pad('', 32)}   median      best     worst`);
console.log('-'.repeat(62));
for (const row of rows) {
  console.log(`${pad(row.label, 32)} ${num(row.median)}  ${num(row.best)}  ${num(row.worst)}  ms`);
}

const frameScan = rows.find((r) => r.label === 'scan, v3 in a 640x480 frame');
const budget = 1000 / 10;
console.log(
  `\nCamera budget at 10 fps is ${budget} ms per frame; a full-frame scan takes ` +
    `${frameScan.median.toFixed(1)} ms (${((frameScan.median / budget) * 100).toFixed(0)}% of it).`,
);
