#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { findGroup, GROUPS, listCopyableFiles, type RegistryGroup } from '../registry/manifest.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_OUT_DIR = 'src/components/teieditor';

/**
 * Read the package's own version from package.json at runtime, walking up from
 * the bundled CLI file (`dist/cli/index.js`) until we find it. Hardcoding the
 * version drifted (the CLI reported 2.0.0 while the package shipped 2.0.2)
 * because release-please bumps package.json but not source literals.
 */
function readPackageVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as {
          name?: string;
          version?: string;
        };
        // Guard against accidentally picking up a nested dependency's manifest.
        if (pkg.name === '@teispace/teieditor' && pkg.version) return pkg.version;
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRegistryDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      // Prefer dist-adjacent source (when used from a local dev checkout).
      const srcPath = join(dir, 'src', 'registry');
      if (existsSync(srcPath)) return srcPath;
      // Published package: registry/ is copied to the package root.
      const pubPath = join(dir, 'registry');
      if (existsSync(pubPath)) return pubPath;
      return srcPath;
    }
    dir = dirname(dir);
  }
  throw new Error('Could not locate teieditor registry directory.');
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

type Action = 'added' | 'skip' | 'updated' | 'modified' | 'unchanged' | 'miss';

function copyGroup(
  group: RegistryGroup,
  registryDir: string,
  outDir: string,
  mode: 'init' | 'update',
  force: boolean,
  added: Set<string>,
): { action: Action; path: string }[] {
  if (added.has(group.name)) return [];
  added.add(group.name);

  // Resolve deps first so the output is importable.
  const results: { action: Action; path: string }[] = [];
  for (const depName of group.deps) {
    const dep = findGroup(depName);
    if (dep) results.push(...copyGroup(dep, registryDir, outDir, mode, force, added));
  }

  const files = listCopyableFiles(registryDir, group.path);
  if (files.length === 0) {
    results.push({ action: 'miss', path: group.path });
    return results;
  }

  for (const rel of files) {
    const src = join(registryDir, rel);
    const dest = join(outDir, rel);

    if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true });

    if (!existsSync(dest)) {
      copyFileSync(src, dest);
      results.push({ action: 'added', path: rel });
      continue;
    }

    // Compare hashes for update-mode clarity and for --force.
    const sameContent = hashFile(src) === hashFile(dest);

    if (sameContent) {
      results.push({ action: 'unchanged', path: rel });
      continue;
    }

    if (force) {
      copyFileSync(src, dest);
      results.push({ action: 'updated', path: rel });
      continue;
    }

    // Local file differs from registry. In init mode: skip (don't clobber).
    // In update mode: report as "modified" so user sees what drifted.
    results.push({ action: mode === 'update' ? 'modified' : 'skip', path: rel });
  }

  return results;
}

function printResults(results: { action: Action; path: string }[]): void {
  const tags: Record<Action, string> = {
    added: pc.green('added   '),
    updated: pc.cyan('updated '),
    unchanged: pc.dim('ok      '),
    skip: pc.yellow('skipped '),
    modified: pc.yellow('modified'),
    miss: pc.red('missing '),
  };
  const messages: Record<Action, string> = {
    added: '',
    updated: '(was default, now latest)',
    unchanged: '(already up to date)',
    skip: '(you edited it — use --force to overwrite)',
    modified: '(local changes — not touched)',
    miss: '(not found in registry)',
  };
  for (const r of results) {
    const tag = tags[r.action];
    const msg = messages[r.action];
    console.log(`  ${tag} ${r.path}${msg ? pc.dim(` ${msg}`) : ''}`);
  }
}

function summarize(results: { action: Action; path: string }[]): string {
  const counts: Partial<Record<Action, number>> = {};
  for (const r of results) counts[r.action] = (counts[r.action] ?? 0) + 1;
  const parts: string[] = [];
  if (counts.added) parts.push(pc.green(`${counts.added} added`));
  if (counts.updated) parts.push(pc.cyan(`${counts.updated} updated`));
  if (counts.unchanged) parts.push(pc.dim(`${counts.unchanged} ok`));
  if (counts.skip) parts.push(pc.yellow(`${counts.skip} skipped`));
  if (counts.modified) parts.push(pc.yellow(`${counts.modified} modified locally`));
  if (counts.miss) parts.push(pc.red(`${counts.miss} missing`));
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('teieditor')
  .description(
    `${pc.bold('@teispace/teieditor')} — A feature-rich, customizable text editor built on Lexical`,
  )
  .version(readPackageVersion());

// -- init -------------------------------------------------------------------

program
  .command('init')
  .description('Scaffold the full UI (toolbar + floating menus + editor presets) into your project')
  .option('-p, --path <dir>', 'Output directory', DEFAULT_OUT_DIR)
  .option('-f, --force', 'Overwrite existing files even if you edited them', false)
  .action((opts: { path: string; force: boolean }) => {
    const spinner = ora('Scaffolding TeiEditor UI...').start();
    const registryDir = getRegistryDir();
    spinner.stop();
    console.log('');

    const absOut = resolve(process.cwd(), opts.path);
    if (!existsSync(absOut)) mkdirSync(absOut, { recursive: true });

    const added = new Set<string>();
    const all = GROUPS.flatMap((g) => copyGroup(g, registryDir, absOut, 'init', opts.force, added));
    printResults(all);

    console.log('');
    console.log(`${pc.green('Done!')} ${summarize(all)}`);
    console.log('');
    console.log(pc.dim('  Next steps:'));
    console.log(
      `  1. ${pc.cyan("import '@teispace/teieditor/styles.css';")} ${pc.dim('// once, in your root layout')}`,
    );
    console.log(
      `  2. ${pc.cyan("import { TeiEditor } from '@/components/teieditor/editors/editor';")}`,
    );
    console.log(`  3. ${pc.cyan('<TeiEditor onChange={setContent} />')}`);
    console.log('');
    console.log(pc.dim('  Prefer a zero-setup drop-in? See `@teispace/teieditor/react`.'));
    console.log('');
  });

// -- update -----------------------------------------------------------------

program
  .command('update')
  .description(
    'Re-sync scaffolded files with the current registry. Safe — local edits are preserved.',
  )
  .option('-p, --path <dir>', 'Scaffolded directory', DEFAULT_OUT_DIR)
  .option('-f, --force', 'Overwrite even locally-modified files (destructive)', false)
  .action((opts: { path: string; force: boolean }) => {
    const registryDir = getRegistryDir();
    const absOut = resolve(process.cwd(), opts.path);

    if (!existsSync(absOut)) {
      console.log('');
      console.log(pc.red(`  No scaffold found at ${opts.path}.`));
      console.log(`  Run ${pc.cyan('teieditor init')} first.`);
      console.log('');
      process.exit(1);
    }

    console.log('');
    const added = new Set<string>();
    const all = GROUPS.flatMap((g) =>
      copyGroup(g, registryDir, absOut, 'update', opts.force, added),
    );
    printResults(all);

    console.log('');
    console.log(`${pc.green('Done!')} ${summarize(all)}`);
    const hasModified = all.some((r) => r.action === 'modified');
    if (hasModified) {
      console.log('');
      console.log(
        pc.dim('  Files marked "modified locally" were left untouched because you edited them.'),
      );
      console.log(
        pc.dim(`  Run ${pc.cyan('teieditor update --force')} to overwrite them (destructive).`),
      );
    }
    console.log('');
  });

// -- add --------------------------------------------------------------------

program
  .command('add <group>')
  .description('Add just one component group (e.g. "toolbar" or "bubble-menu")')
  .option('-p, --path <dir>', 'Output directory', DEFAULT_OUT_DIR)
  .option('-f, --force', 'Overwrite existing files', false)
  .action((name: string, opts: { path: string; force: boolean }) => {
    const entry = findGroup(name);
    if (!entry) {
      console.log('');
      console.error(pc.red(`  Unknown group "${name}".`));
      console.log(`  Run ${pc.cyan('teieditor list')} for available groups.`);
      console.log('');
      process.exit(1);
    }

    const registryDir = getRegistryDir();
    const absOut = resolve(process.cwd(), opts.path);
    if (!existsSync(absOut)) mkdirSync(absOut, { recursive: true });

    console.log('');
    const results = copyGroup(entry, registryDir, absOut, 'init', opts.force, new Set());
    printResults(results);
    console.log('');
    console.log(`${pc.green('Done!')} ${summarize(results)}`);
    console.log('');
  });

// -- list -------------------------------------------------------------------

program
  .command('list')
  .description('List scaffoldable component groups')
  .action(() => {
    console.log('');
    console.log(pc.bold('  Available groups:'));
    console.log('');
    for (const g of GROUPS) {
      const depText = g.deps.length ? pc.dim(` (needs: ${g.deps.join(', ')})`) : '';
      console.log(`  ${pc.green(g.name.padEnd(16))} ${pc.dim(g.description)}${depText}`);
    }
    console.log('');
    console.log(
      pc.dim(
        `  Scaffold all: ${pc.cyan('teieditor init')}  |  One group: ${pc.cyan('teieditor add <group>')}  |  Refresh: ${pc.cyan('teieditor update')}`,
      ),
    );
    console.log('');
  });

// -- parse ------------------------------------------------------------------

program.parse();
