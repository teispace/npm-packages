/**
 * Reading codes back, from anything image-shaped.
 *
 * The decoder ships alongside the encoder, so this is the same code that
 * `verify()` uses to prove a styled symbol still scans.
 */
import { qr } from 'teiqr';
import { encode } from 'teiqr/core';
import { toPng } from 'teiqr/raster';
import { decodePng } from 'teiqr/raster';
import { scan, scanAll, tryScan } from 'teiqr/verify';
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
