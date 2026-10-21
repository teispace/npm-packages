#!/usr/bin/env node
/**
 * Run the e2e suite with its pixel baselines inside the Linux Playwright
 * image, the same one CI uses, so fonts and anti-aliasing match.
 *
 *   yarn test:visual            compare against the baselines
 *   yarn test:visual --update   write new baselines
 *   yarn test:visual -- -g menu any further Playwright arguments
 *
 * The repository is copied into the container without its node_modules
 * (they are built for this machine), dependencies are installed for Linux
 * into a cached volume, and only the screenshots (and failure reports)
 * come back.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const pkg = join(import.meta.dirname, '..');
const repo = join(pkg, '..', '..');
const inRepo = relative(repo, pkg);
const { version } = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('@playwright/test/package.json'), 'utf8'),
);
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const update = args.includes('--update');
const extra = args.filter((arg) => arg !== '--update');
const shots = join(pkg, 'e2e', 'specs', '__screenshots__');
const results = join(pkg, 'test-results');
mkdirSync(shots, { recursive: true });
mkdirSync(results, { recursive: true });

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const script = [
  'set -e',
  'mkdir -p /work',
  "tar -C /src --exclude=node_modules --exclude=.git --exclude='*/dist' --exclude='*/.out' --exclude='*/test-results' -cf - . | tar -C /work -xf -",
  'cd /work',
  'corepack enable',
  'yarn workspaces focus @teispace/teieditor > /tmp/install.log 2>&1 || { cat /tmp/install.log; exit 1; }',
  `cd ${quote(inRepo)}`,
  'status=0',
  `TEI_VISUAL=1 CI= npx playwright test -c e2e/playwright.config.ts ${update ? '--update-snapshots ' : ''}${extra.map(quote).join(' ')} || status=$?`,
  // On update the container's set replaces the old one, so renamed shots leave nothing behind.
  update ? 'find /shots -mindepth 1 -delete && cp -R e2e/specs/__screenshots__/. /shots/' : ':',
  'cp -R test-results/. /results/ 2>/dev/null || true',
  'exit $status',
].join('\n');

const run = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '-e',
    'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
    '-v',
    `${repo}:/src:ro`,
    '-v',
    `${shots}:/shots`,
    '-v',
    `${results}:/results`,
    '-v',
    'teieditor-visual-yarn:/root/.yarn/berry',
    image,
    'bash',
    '-c',
    script,
  ],
  { stdio: 'inherit' },
);
if (run.error) {
  console.error(`Could not start Docker (${run.error.message}); \`yarn test:visual\` needs it.`);
  process.exit(1);
}
console.log(`\n${image}: ${run.status === 0 ? 'passed' : 'failed'}`);
process.exit(run.status ?? 1);
