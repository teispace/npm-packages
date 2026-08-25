/**
 * The five-minute tour: one symbol, every output format.
 *
 * `qr()` encodes once and keeps the matrix, so asking for SVG and then PNG
 * does not re-run Reed-Solomon or re-pick a mask.
 */
import { qr } from 'teiqr';
import { check, save, section } from './_shared.mjs';

const code = qr('https://example.com/hello', { ecc: 'Q' });

section('One symbol, several formats');
save('01-basic.svg', code.svg());
save('01-basic.png', code.png({ scale: 10 }));

const dataUrl = code.dataUrl({ scale: 4 });
console.log(`    data URL is ${dataUrl.length} chars, starts ${dataUrl.slice(0, 30)}…`);

section('Terminal output, for a CLI or a log');
console.log(code.terminal({ scale: 1 }).split('\n').slice(0, 6).map((l) => `    ${l}`).join('\n'));
console.log('    …');

section('What the encoder decided');
console.log(`    version ${code.matrix.version}, ${code.matrix.size} modules, level ${code.matrix.ecc}, mask ${code.matrix.mask}`);
// boostEcc is on by default: the level actually used may exceed the one asked
// for, because the chosen version had room to spare and redundancy is free.
check(code.matrix.ecc >= 'Q', 'expected at least the requested level');

section('Raw pixels, if you have your own renderer');
const { pixels, width, height } = code.pixels({ scale: 4 });
check(pixels.length === width * height * 4, 'RGBA buffer should be width * height * 4');
console.log(`    ${width}x${height} RGBA, ${pixels.length.toLocaleString()} bytes`);
