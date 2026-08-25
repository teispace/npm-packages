#!/usr/bin/env node
/**
 * Measure the figures in the README's "Entry points and bundle size" table.
 *
 *     yarn build && node scripts/measure-bundles.mjs
 *
 * Bundles each entry point — and each individual import — with esbuild,
 * minifies, gzips, and reports the result. Tree-shaking claims are checked the
 * same way: bundle one import and look for markers that only appear in code it
 * should not have pulled in.
 *
 * This is a script rather than a test on purpose. It needs `dist/` to exist,
 * and a test that silently depends on build order is worse than no test.
 * Re-run it whenever the table might have moved and paste the numbers in.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), 'teiqr-size-'));

/** Entry points, in the order the README lists them. */
const ENTRIES = [
  ['teiqr', 'index', 'everything'],
  ['teiqr/core', 'core', 'encoding only'],
  ['teiqr/render', 'render', 'scene + SVG'],
  ['teiqr/validate', 'validate', 'scannability analysis'],
  ['teiqr/payload', 'payload', 'typed builders + parsers'],
  ['teiqr/export', 'export', 'PDF, EPS, ZIP, CSV batch'],
  ['teiqr/raster', 'raster', 'DEFLATE + PNG + rasteriser'],
  ['teiqr/verify', 'verify', 'decoder + scanner'],
  ['teiqr/terminal', 'terminal', 'text output'],
  ['teiqr/kanji', 'kanji', 'Shift-JIS table (opt-in)'],
  ['teiqr/jpeg', 'jpeg', 'JPEG decoder, incl. progressive (opt-in)'],
  ['teiqr/react', 'react', 'components + hooks (react external)'],
];

/**
 * Single imports, with a marker that must NOT survive tree-shaking.
 *
 * Each marker is a string literal that appears only in the code the import
 * should exclude, so finding it in the bundle means something unrelated came
 * along for the ride.
 */
const NAMED = [
  ['encode', 'core', 'encode', null],
  ['toPng', 'raster', 'toPng', null],
  ['scan', 'verify', 'scan', null],
  ['toTerminal', 'terminal', 'toTerminal', null],
  ['parsePayload', 'payload', 'parsePayload', null],
  ['<QrCode>', 'react', 'QrCode', 'getUserMedia'],
  ['useQrScanner', 'react', 'useQrScanner', 'viewBox'],
];

const bundle = async (source, name) => {
  const file = join(scratch, `${name.replace(/\W/g, '_')}.js`);
  writeFileSync(file, source);
  const result = await build({
    entryPoints: [file],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'node:*'],
    logLevel: 'silent',
  });
  const text = result.outputFiles[0].text;
  return { kb: gzipSync(result.outputFiles[0].contents).length / 1000, text };
};

console.log('| Entry             | Gzipped | What it is                                |');
console.log('| ----------------- | ------: | ----------------------------------------- |');
for (const [label, file, what] of ENTRIES) {
  const { kb } = await bundle(`export * from '${pkg}/dist/${file}.js';`, label);
  console.log(`| \`${label}\`${' '.repeat(Math.max(0, 16 - label.length))} | ${kb.toFixed(1).padStart(4)} kB | ${what.padEnd(41)} |`);
}

console.log('\n| Import | Gzipped | Unrelated code pulled in |');
console.log('| --- | ---: | --- |');
for (const [label, file, symbol, marker] of NAMED) {
  const { kb, text } = await bundle(
    `import { ${symbol} } from '${pkg}/dist/${file}.js'; console.log(${symbol});`,
    label,
  );
  const leaked = marker !== null && text.includes(marker);
  console.log(`| \`${label}\` | ${kb.toFixed(1)} kB | ${leaked ? `LEAKED: ${marker}` : 'none'} |`);
}
