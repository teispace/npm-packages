/**
 * Reading codes back, from anything image-shaped.
 *
 * The decoder ships alongside the encoder, so this is the same code that
 * `verify()` uses to prove a styled symbol still scans.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qr } from 'teiqr';
import { encode } from 'teiqr/core';
import { crc32, decodePng, toPng, zlibDeflate } from 'teiqr/raster';
import { scan, scanAll, tryScan } from 'teiqr/verify';
import 'teiqr/jpeg';
import { check, section } from './_shared.mjs';

const url = 'https://example.com/scanning';
const png = qr(url).png({ scale: 8 });

section('Every input shape scan() accepts');
console.log(`    PNG bytes            -> ${scan(png).text}`);
console.log(`    Node Buffer          -> ${scan(Buffer.from(png)).text}`);
console.log(`    data URL             -> ${scan(qr(url).dataUrl({ scale: 8 })).text}`);
const image = decodePng(png);
console.log(`    { data, width, height } -> ${scan({ data: image.pixels, width: image.width, height: image.height }).text}`);
console.log(`    a QrMatrix directly  -> ${scan(encode(url)).text}`);

section('What comes back');
const result = scan(png);
console.log(`    text     ${result.text}`);
console.log(`    version  ${result.version}, level ${result.ecc}, mask ${result.mask}`);
console.log(`    segments ${result.segments.map((s) => `${s.mode}(${s.text.length})`).join(' + ')}`);
console.log(`    repaired ${result.corrected} codeword(s)`);
console.log(`    module size ${result.moduleSize.toFixed(1)} px at ${JSON.stringify(result.origin)}`);

section('Several codes in one image');
// Codes laid out side by side, as a printed sheet would have them.
const codes = ['first', 'second', 'third'].map((t) => decodePng(qr(t).png({ scale: 6 })));
const gap = 20;
const width = codes.reduce((n, c) => n + c.width + gap, gap);
const height = Math.max(...codes.map((c) => c.height)) + gap * 2;
const sheet = new Uint8Array(width * height * 4).fill(255);
let x = gap;
for (const code of codes) {
  for (let y = 0; y < code.height; y++) {
    for (let i = 0; i < code.width; i++) {
      const from = (y * code.width + i) * 4;
      const to = ((y + gap) * width + x + i) * 4;
      for (let c = 0; c < 4; c++) sheet[to + c] = code.pixels[from + c];
    }
  }
  x += code.width + gap;
}
const found = scanAll({ data: sheet, width, height });
console.log(`    found ${found.length}: ${found.map((r) => r.text).join(', ')}`);
check(found.length === 3, 'expected all three codes');
// Results come back in reading order, which is what you want for a sheet.
check(found[0].text === 'first', 'expected reading order');

section('tryScan for camera loops, where most frames are empty');
console.log(`    empty frame -> ${tryScan({ data: new Uint8Array(200 * 200 * 4).fill(255), width: 200, height: 200 })}`);
console.log(`    real frame  -> ${tryScan(png)?.text}`);

section('Damage is repaired, up to the level of the code');
const damaged = Uint8Array.from(png);
// Corrupt some bytes of the compressed stream; the PNG still decodes, the
// image is dirtier, and Reed-Solomon does the rest.
for (let i = 200; i < Math.min(260, damaged.length); i += 7) damaged[i] ^= 0x0f;
const repaired = tryScan(damaged);
console.log(`    ${repaired ? `read "${repaired.text}" after repairing ${repaired.corrected} codeword(s)` : 'too damaged to read, reported honestly'}`);

section('PNGs other tools wrote, in formats this package never emits');
// A QR code is a two-colour image, so almost nothing stores it as 8-bit RGBA.
// Encoders and optimisers reach for 1-bit palette or greyscale, which is eight
// pixels to the byte. The bundled decoder reads the whole PNG colour model for
// exactly this reason — greyscale, palette and both alpha variants, at every
// depth each allows, interlaced or not.
//
// Built here with the package's own CRC and deflate, so the example needs
// nothing from Node beyond what teiqr already exports.
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => {
  const body = [...type].map((c) => c.charCodeAt(0)).concat(Array.from(data));
  return [...be32(body.length - 4), ...body, ...be32(crc32(Uint8Array.from(body)))];
};

/** Re-encode a decoded image as 1-bit palette, the densest PNG there is. */
const asOneBitPalette = ({ pixels, width, height }) => {
  const bytesPerRow = Math.ceil(width / 8);
  const raw = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(bytesPerRow);
    for (let x = 0; x < width; x++) {
      // Bit set = palette entry 1 = white; clear = entry 0 = black.
      if (pixels[(y * width + x) * 4] > 127) row[x >> 3] |= 0x80 >> (x & 7);
    }
    raw.push(0, ...row); // filter 0: none
  }
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...be32(width), ...be32(height), 1, 3, 0, 0, 0]),
    ...chunk('PLTE', [0, 0, 0, 255, 255, 255]),
    ...chunk('IDAT', zlibDeflate(Uint8Array.from(raw))),
    ...chunk('IEND', []),
  ]);
};

const palette = asOneBitPalette(decodePng(png));
console.log(`    1-bit palette PNG is ${palette.length} bytes vs ${png.length} for RGBA`);
console.log(`    scanned -> ${scan(palette).text}`);
check(scan(palette).text === url, 'a 1-bit palette PNG should scan');
check(palette.length < png.length, 'the palette encoding should be the smaller one');

section('A photograph, not a render: JPEG, baseline and progressive');
// A camera never produces a PNG. `import 'teiqr/jpeg'` registers a baseline
// decoder so scan() reads JPEG synchronously, on any runtime, with no canvas
// and no await — the same call, just more formats.
//
// It is a separate entry point on purpose: a code you generated is never a
// JPEG, so the Huffman tables and inverse DCT stay out of everyone else's
// bundle. Importing it costs 2.9 kB gzipped, and nothing at all if you do not.
const assets = join(dirname(dirname(fileURLToPath(import.meta.url))), 'assets');
const photo = new Uint8Array(readFileSync(join(assets, 'photographed.jpg')));
console.log(`    a 4:2:0 JPEG (${photo.length.toLocaleString()} bytes) -> ${scan(photo).text}`);
check(scan(photo).text === 'https://example.com/photographed', 'the JPEG should scan');

// Progressive JPEG too — the same image with its coefficients rearranged into
// spectral bands and bit planes, which is what much of the web serves. It is a
// genuinely different decode path, and `jpegtran -progressive` is lossless, so
// the two must produce the same pixels rather than merely the same payload.
const progressive = new Uint8Array(readFileSync(join(assets, 'photographed-progressive.jpg')));
console.log(`    the same code, progressive        -> ${scan(progressive).text}`);
check(scan(progressive).text === scan(photo).text, 'both encodings should agree');

// Same bytes, same call, no format argument anywhere: whatever the image is,
// scan() works it out. Without the teiqr/jpeg import these bytes are refused
// with a message naming the import rather than a bare failure.
console.log('    no format argument, and no await — scan() sorts it out');
