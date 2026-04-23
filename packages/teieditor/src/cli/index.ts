#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_OUT_DIR = 'src/components/teieditor';
const COPYABLE_EXTENSIONS = new Set(['.tsx', '.ts', '.css', '.md']);

// "Groups" are top-level folders under registry/ that a user can scaffold
// independently. Everything except `index.ts` is a copyable group.
interface Group {
  name: string;
  description: string;
  /** Folder under registry/ (e.g. "ui", "components/toolbar") */
  path: string;
  /** Other groups this group needs to function. */
  deps: string[];
}

const GROUPS: Group[] = [
  {
    name: 'ui',
    description: 'Primitives (button, dropdown, modal, icons, ...)',
    path: 'ui',
    deps: [],
  },
  {
    name: 'toolbar',
    description: 'Top toolbar with formatting, blocks, fonts, colors',
    path: 'components/toolbar',
    deps: ['ui'],
  },
  {
    name: 'bubble-menu',
    description: 'Floating format menu shown on text selection',
    path: 'components/bubble-menu',
    deps: ['ui'],
  },
  {
    name: 'slash-menu',
    description: '/ slash-command palette',
    path: 'components/slash-menu',
    deps: ['ui'],
  },
  {
    name: 'link-editor',
    description: 'Floating link view/edit popover',
    path: 'components/link-editor',
    deps: ['ui'],
  },
  {
    name: 'mention-list',
    description: '@-mention typeahead list',
    path: 'components/mention-list',
    deps: ['ui'],
  },
  {
    name: 'table-menu',
    description: 'Table operations (insert row/col, delete, ...)',
    path: 'components/table-menu',
    deps: ['ui'],
  },
  {
    name: 'context-menu',
    description: 'Right-click block menu',
    path: 'components/context-menu',
    deps: ['ui'],
  },
  {
    name: 'code-bar',
    description: 'Code-block language selector + copy',
    path: 'components/code-bar',
    deps: ['ui'],
  },
  {
    name: 'editor',
    description: 'Full WYSIWYG preset (TeiEditor) — depends on everything above',
    path: 'editors',
    deps: [
      'ui',
      'toolbar',
      'bubble-menu',
      'slash-menu',
      'link-editor',
      'mention-list',
      'table-menu',
      'context-menu',
      'code-bar',
    ],
  },
];

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

function listCopyableFiles(root: string, sub: string): string[] {
  const base = join(root, sub);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        const dot = entry.lastIndexOf('.');
        if (dot > -1 && COPYABLE_EXTENSIONS.has(entry.slice(dot))) {
          out.push(relative(root, full));
        }
      }
    }
  };
  walk(base);
  return out;
}

type Action = 'added' | 'skip' | 'updated' | 'modified' | 'unchanged' | 'miss';

function copyGroup(
  group: Group,
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
    const dep = GROUPS.find((g) => g.name === depName);
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
  .version('2.0.0');

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
    const entry = GROUPS.find((g) => g.name === name);
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
