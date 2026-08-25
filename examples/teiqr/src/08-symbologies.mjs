/**
 * The two compact symbologies, for places a QR code will not fit.
 *
 * Micro QR is for small square surfaces — circuit boards, blister packs. rMQR
 * is for long thin ones — test tubes, cable wraps, the edge of a PCB. Both
 * encode and decode here, and both render through the same pipeline.
 */
import { encode } from 'teiqr/core';
import { encodeMicro, MICRO_LEVELS, MICRO_VERSIONS, microVersionOf } from 'teiqr/core';
import { encodeRmqr, RMQR_SPECS, rmqrVersionOf } from 'teiqr/core';
import { toPng } from 'teiqr/raster';
import { renderSvg } from 'teiqr/render';
import { scan } from 'teiqr/verify';
import { check, save, section } from './_shared.mjs';

section('Micro QR: a quarter of the area for a short payload');
const micro = encodeMicro('12345');
const full = encode('12345');
console.log(`    Micro QR ${microVersionOf(micro)}: ${micro.size}x${micro.size} modules`);
console.log(`    full QR  version ${full.version}: ${full.size}x${full.size} modules`);
console.log(`    ${((micro.size ** 2 / full.size ** 2) * 100).toFixed(0)}% of the area`);
save('08-micro.svg', renderSvg(micro, { moduleShape: 'square' }).svg);
save('08-micro.png', toPng(micro, {}, { scale: 12, background: '#ffffff' }));

section('What each Micro QR version can carry');
for (const version of MICRO_VERSIONS) {
  console.log(`    ${version}: ${9 + 2 * (MICRO_VERSIONS.indexOf(version) + 1)} modules, levels ${MICRO_LEVELS[version].join('/')}`);
}

section('Micro QR segments across modes, like full QR');
const mixed = encodeMicro('abc123XYZ', { version: 'M4' });
const readMixed = scan(mixed);
console.log(`    "abc123XYZ" -> ${readMixed.segments.map((s) => `${s.mode}("${s.text}")`).join(' + ')}`);
check(readMixed.text === 'abc123XYZ', 'multi-segment Micro QR should round trip');

section('rMQR: rectangular, for narrow surfaces');
const rmqr = encodeRmqr('SERIAL-4417');
const spec = RMQR_SPECS[rmqrVersionOf(rmqr)];
console.log(`    ${rmqrVersionOf(rmqr)}: ${spec.width}x${spec.height} modules — ${(spec.width / spec.height).toFixed(1)}:1`);
save('08-rmqr.svg', renderSvg(rmqr).svg);
save('08-rmqr.png', toPng(rmqr, {}, { scale: 12, background: '#ffffff' }));

section('Choosing the shape');
for (const fit of ['width', 'height', 'area']) {
  const shaped = encodeRmqr('https://example.com/x', { fit });
  const s = RMQR_SPECS[rmqrVersionOf(shaped)];
  console.log(`    fit: ${fit.padEnd(7)} -> ${rmqrVersionOf(shaped).padEnd(8)} ${s.width}x${s.height}`);
}

section('All three read back from rendered pixels, not just from a matrix');
for (const [label, matrix, expected] of [
  ['QR', encode('read me back'), 'read me back'],
  ['Micro QR', encodeMicro('12345'), '12345'],
  ['rMQR', encodeRmqr('SERIAL-4417'), 'SERIAL-4417'],
]) {
  const png = toPng(matrix, {}, { scale: 10, background: '#ffffff' });
  const got = scan(png).text;
  console.log(`    ${label.padEnd(9)} -> ${got}`);
  check(got === expected, `${label} should scan from pixels`);
}
