#!/usr/bin/env node
/**
 * Run every example, and fail if any of them does.
 *
 * That is the whole point. Examples rot faster than anything else in a
 * repository — they are the first thing an API change breaks and the last
 * thing anyone runs — so each one asserts what it demonstrates and this runs
 * the lot. An example that no longer works is a failing build, not a
 * documentation bug someone will notice eventually.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');

const examples = readdirSync(src)
  .filter((name) => name.endsWith('.mjs') && !name.startsWith('_'))
  .sort();

let failed = 0;
const started = Date.now();

for (const name of examples) {
  const title = name.replace(/^\d+-/, '').replace(/\.mjs$/, '');
  console.log(`\n\x1b[1m▶ ${name}\x1b[0m  ${'─'.repeat(Math.max(0, 58 - name.length))}`);

  const result = spawnSync(process.execPath, [join(src, name)], {
    stdio: 'inherit',
    timeout: 120_000,
  });

  if (result.status !== 0) {
    failed++;
    console.error(`\x1b[31m✗ ${title} failed (exit ${result.status ?? result.signal})\x1b[0m`);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${'─'.repeat(62)}`);
if (failed === 0) {
  console.log(`\x1b[32m✓ all ${examples.length} examples ran in ${seconds}s\x1b[0m`);
  console.log('  output is in ./out — open the SVGs, scan the PNGs with a phone');
} else {
  console.error(`\x1b[31m✗ ${failed} of ${examples.length} examples failed\x1b[0m`);
}
process.exit(failed > 0 ? 1 : 0);
