/**
 * Print-ready vector, and everything else, without a canvas.
 *
 * PDF and EPS are sized in real millimetres rather than pixels, because a code
 * that is going on a label has a physical size and guessing at DPI is how it
 * ends up unscannable.
 */
import { encode } from 'teiqr/core';
import { exportQr } from 'teiqr/export';
import { renderSvg } from 'teiqr/render';
import { toPng } from 'teiqr/raster';
import { toTerminal } from 'teiqr/terminal';
import { check, save, section } from './_shared.mjs';

const matrix = encode('https://example.com/formats', { ecc: 'H' });
const style = { moduleShape: 'rounded' };

section('SVG');
const { svg, width, height } = renderSvg(matrix, style);
console.log(`    ${width}x${height} user units`);
save('03-formats.svg', svg);

section('PNG, synchronously and with no canvas anywhere');
save('03-formats.png', toPng(matrix, style, { scale: 8, background: '#ffffff' }));

section('PDF and EPS at a real physical size');
for (const format of ['pdf', 'eps']) {
  const result = exportQr(matrix, style, format, { sideMm: 40, title: 'teiqr example' });
  save(`03-formats.${format}`, result.bytes);
  console.log(`    ${format}: ${result.mime}`);
}
// 40 mm at 72 points to the inch is 113.386 pt; the PDF says so itself.
const pdf = new TextDecoder().decode(exportQr(matrix, style, 'pdf', { sideMm: 40 }).bytes);
check(/MediaBox\s*\[\s*0\s+0\s+113\.\d+/.test(pdf), 'PDF page should be 40mm square');
console.log('    PDF MediaBox confirms 40 mm square');

section('Terminal');
console.log(toTerminal(matrix, { scale: 1 }).split('\n').slice(0, 4).map((l) => `    ${l}`).join('\n'));
