/**
 * Will this code actually scan?
 *
 * Two different questions, and the package answers both.
 *
 * `validate()` is analysis: contrast, quiet zone, print size, and exactly how
 * much of the error correction budget a logo eats. `verify()` is not analysis
 * at all — it rasterises the styled symbol and reads it back with the decoder
 * that ships alongside, so it either produces the payload or throws.
 */
import { qr } from 'teiqr';
import { save, section } from './_shared.mjs';

const url = 'https://example.com/validation';

section('A sensible code');
const good = qr(url, { moduleShape: 'rounded', ecc: 'Q' });
const goodReport = good.validate({ scanDistanceMm: 300, dpi: 300 });
console.log(`    score ${goodReport.score}/100, ${goodReport.issues.length} issue(s)`);
console.log(`    contrast ${goodReport.contrast.toFixed(1)}:1, inverted: ${goodReport.inverted}`);
console.log(`    recommended print size: ${goodReport.print.recommendedSideMm} mm`);
console.log(`    verify(): ${good.verify().text === url ? 'reads back correctly' : 'FAILED'}`);

section('A code with problems, reported rather than hidden');
const bad = qr(url, {
  moduleShape: 'star',
  body: { kind: 'solid', color: '#9ca3af' },
  background: { kind: 'solid', color: '#d1d5db' },
  quietZone: 1,
});
const badReport = bad.validate();
console.log(`    score ${badReport.score}/100`);
for (const issue of badReport.issues) {
  console.log(`    [${issue.level}] ${issue.title} — ${issue.detail}`);
}

section('Logo damage, computed against the real interleave map');
// The usual advice is "keep a logo under 30% at level H". That is wrong in
// both directions: error correction is applied per Reed-Solomon block, so
// damage concentrated in one block can kill a code covering far less than 30%,
// while evenly spread damage survives much more. This walks the real module
// placement order and the real block map.
const logo = new URL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
for (const sizeRatio of [0.15, 0.25, 0.35]) {
  const withLogo = qr(url, {
    ecc: 'H',
    logo: { href: logo.href, sizeRatio, padding: 1, shape: 'circle', excavate: true, background: '#ffffff' },
  });
  const report = withLogo.validate();
  const coverage = report.coverage;
  console.log(
    `    ${(sizeRatio * 100).toFixed(0)}% logo covers ${(coverage.coveredFraction * 100).toFixed(1)}% of the modules: ` +
      `${coverage.damagedCodewords} codewords damaged, worst block ${coverage.worstBlockDamaged}/${coverage.worstBlockCapacity} ` +
      `(${(coverage.utilisation * 100).toFixed(0)}% of its budget) — ${coverage.recoverable ? 'recoverable' : 'NOT recoverable'}`,
  );
  if (sizeRatio === 0.25) save('04-logo.svg', withLogo.svg());
}

section('verify() proves it, rather than estimating');
try {
  qr(url, {
    ecc: 'L',
    logo: { href: logo.href, sizeRatio: 0.6, padding: 2, shape: 'square', excavate: true, background: '#ffffff' },
  }).verify();
  console.log('    unexpectedly readable');
} catch (error) {
  // Use `error.name` or `instanceof`, never `error.constructor.name`: the
  // published build is minified, so the constructor is called something like
  // `w`. Every error this package throws sets `name` explicitly for exactly
  // this reason, and `instanceof` works regardless.
  console.log(`    a 60% logo at level L does not read back: ${error.name}`);
}
