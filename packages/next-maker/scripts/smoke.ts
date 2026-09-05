import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Composition matrix: create one project per case from a local starter
 * checkout, then run its own gates. Fails loudly on the first broken case.
 *
 *   NEXT_MAKER_STARTER_PATH=../../../starters/nextjs-starter yarn tsx scripts/smoke.ts [case ...]
 *
 * Cases are `name:arg arg ...` where args are `init` flags. With no
 * arguments every case runs. Set SMOKE_KEEP=1 to keep the generated
 * projects for inspection.
 */
const CASES: Record<string, string[]> = {
  default: ['--yes'],
  minimal: ['--yes', '--preset', 'minimal'],
  full: ['--yes', '--preset', 'full'],
  zustand: ['--yes', '--preset', 'zustand'],
  spa: ['--yes', '--preset', 'spa'],
  'no-i18n': ['--yes', '--set', 'i18n=false'],
  'no-dark': ['--yes', '--set', 'darkMode=false'],
  'no-state-i18n': ['--yes', '--set', 'state=none', '--set', 'i18n=false'],
  'zustand-no-i18n-axios': ['--yes', '--set', 'state=zustand', '--set', 'i18n=false', '--set', 'http=axios'],
  npm: ['--yes', '--package-manager', 'npm', '--set', 'docker=true', '--set', 'ci=true'],
  bff: ['--yes', '--set', 'bff=true', '--set', 'e2e=false'],
};

/** Cases whose Playwright suite runs when SMOKE_E2E=1 (browsers must be installed). */
const E2E_CASES = new Set(['default']);

const cli = path.resolve(import.meta.dirname, '../src/index.ts');
const tsx = path.resolve(import.meta.dirname, '../../../node_modules/.bin/tsx');
const starter = process.env.NEXT_MAKER_STARTER_PATH;
if (!starter) {
  console.error('Set NEXT_MAKER_STARTER_PATH to a local starter checkout.');
  process.exit(1);
}

const selected = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(CASES);

const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) => {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    // Corepack downloads the package manager a generated project pins; never
    // stop for its confirmation prompt.
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
};

const runScript = (pm: string, script: string, cwd: string, extraEnv: NodeJS.ProcessEnv = {}) => {
  const args = pm === 'npm' || pm === 'bun' ? ['run', script] : [script];
  return run(pm, args, cwd, extraEnv);
};

const root = await mkdtemp(path.join(tmpdir(), 'next-maker-smoke-'));
const failures: string[] = [];
const started = Date.now();

for (const name of names) {
  const args = CASES[name];
  if (!args) {
    console.error(`Unknown case ${name}. Valid: ${Object.keys(CASES).join(', ')}`);
    process.exit(1);
  }
  const project = `app-${name}`;
  const pmIndex = args.indexOf('--package-manager');
  const pm = pmIndex === -1 ? 'pnpm' : args[pmIndex + 1];
  const t = Date.now();
  process.stdout.write(`▶ ${name.padEnd(24)} `);

  const init = run(tsx, [cli, 'init', project, ...args, '--no-git'], root, {
    NEXT_MAKER_STARTER_PATH: starter,
  });
  if (!init.ok) {
    failures.push(name);
    console.log('✗ init failed');
    console.log(init.output.split('\n').slice(-40).join('\n'));
    continue;
  }
  const cwd = path.join(root, project);
  const scripts = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf-8')).scripts as Record<string, string>;
  const steps: [string, () => { ok: boolean; output: string }][] = [
    ['ci:check', () => runScript(pm, 'ci:check', cwd)],
    ['type-check', () => runScript(pm, 'type-check', cwd)],
    ['check:deprecated', () => runScript(pm, 'check:deprecated', cwd)],
    ['test', () => runScript(pm, 'test', cwd)],
    ['build', () => runScript(pm, 'build', cwd, { NEXT_PUBLIC_APP_URL: 'https://ci.example.com' })],
  ];
  if (process.env.SMOKE_E2E && E2E_CASES.has(name)) {
    steps.push(['test:e2e', () => run(pm, pm === 'npm' || pm === 'bun' ? ['run', 'test:e2e', '--', '--project=chromium'] : ['test:e2e', '--project=chromium'], cwd, { CI: 'true' })]);
  }
  let failed = false;
  for (const [label, step] of steps) {
    if (!scripts[label]) continue;
    const result = step();
    if (!result.ok) {
      failed = true;
      failures.push(`${name}:${label}`);
      console.log(`✗ ${label} failed`);
      console.log(result.output.split('\n').filter(Boolean).slice(-40).join('\n'));
      break;
    }
  }
  if (!failed) console.log(`✓ ${((Date.now() - t) / 1000).toFixed(0)}s`);
}

if (!process.env.SMOKE_KEEP) await rm(root, { recursive: true, force: true });
else console.log(`Projects kept in ${root}`);

console.log('');
console.log(
  failures.length
    ? `✗ ${failures.length} failure(s): ${failures.join(', ')} (${((Date.now() - started) / 1000).toFixed(0)}s)`
    : `✓ ${names.length} case(s) passed in ${((Date.now() - started) / 1000).toFixed(0)}s`,
);
process.exit(failures.length ? 1 : 0);
