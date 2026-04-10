#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

interface RegistryEntry {
  name: string;
  description: string;
  files: string[];
  deps: string[];
}

const COMPONENTS: RegistryEntry[] = [
  {
    name: 'toolbar',
    description: 'Full-featured toolbar with formatting, blocks, lists, fonts, colors',
    files: ['toolbar.tsx'],
    deps: [],
  },
  {
    name: 'editor',
    description: 'Zero-config TeiEditor with toolbar, bubble menu, slash commands',
    files: ['editor.tsx'],
    deps: ['toolbar'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRegistryDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      const srcPath = join(dir, 'src', 'registry', 'ui');
      if (existsSync(srcPath)) return srcPath;
      const pubPath = join(dir, 'registry', 'ui');
      if (existsSync(pubPath)) return pubPath;
      return srcPath;
    }
    dir = dirname(dir);
  }
  throw new Error('Could not locate teieditor registry directory.');
}

function addComponent(name: string, outDir: string, registryDir: string, added: Set<string>): void {
  if (added.has(name)) return;

  const entry = COMPONENTS.find((c) => c.name === name);
  if (!entry) {
    console.error(pc.red(`  Error: Unknown component "${name}".`));
    console.log(`  Run ${pc.cyan('teieditor list')} to see available components.\n`);
    process.exit(1);
    return; // unreachable but satisfies TS
  }

  // Add dependencies first
  for (const dep of entry.deps) {
    addComponent(dep, outDir, registryDir, added);
  }

  const absOut = resolve(process.cwd(), outDir);
  if (!existsSync(absOut)) {
    mkdirSync(absOut, { recursive: true });
  }

  for (const file of entry.files) {
    const src = join(registryDir, file);
    const dest = join(absOut, file);

    if (existsSync(dest)) {
      console.log(`  ${pc.yellow('skip')}  ${file} ${pc.dim('(already exists)')}`);
    } else if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`  ${pc.green('added')} ${file}`);
    } else {
      console.log(`  ${pc.red('miss')}  ${file} ${pc.dim('(not found in registry)')}`);
    }
  }

  added.add(name);
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
  .version('1.0.0');

// -- init -------------------------------------------------------------------

program
  .command('init')
  .description('Scaffold all default UI components into your project')
  .option('-p, --path <dir>', 'Output directory', DEFAULT_OUT_DIR)
  .action(async (opts: { path: string }) => {
    const spinner = ora('Initializing TeiEditor components...').start();
    const registryDir = getRegistryDir();
    const added = new Set<string>();

    spinner.stop();
    console.log('');

    for (const c of COMPONENTS) {
      addComponent(c.name, opts.path, registryDir, added);
    }

    console.log('');
    console.log(`${pc.green('Done!')} Components added to ${pc.cyan(`${opts.path}/`)}`);
    console.log('');
    console.log(pc.dim('  Usage:'));
    console.log('');
    console.log(pc.cyan("  import { TeiEditor } from '@/components/teieditor/editor';"));
    console.log('');
    console.log(pc.cyan('  <TeiEditor onChange={setContent} />'));
    console.log('');
  });

// -- add --------------------------------------------------------------------

program
  .command('add <component>')
  .description('Add a specific UI component to your project')
  .option('-p, --path <dir>', 'Output directory', DEFAULT_OUT_DIR)
  .action((component: string, opts: { path: string }) => {
    console.log('');
    const registryDir = getRegistryDir();
    addComponent(component, opts.path, registryDir, new Set());
    console.log('');
  });

// -- list -------------------------------------------------------------------

program
  .command('list')
  .description('List all available UI components')
  .action(() => {
    console.log('');
    console.log(pc.bold('  Available components:'));
    console.log('');
    for (const c of COMPONENTS) {
      console.log(`  ${pc.green(c.name.padEnd(12))} ${pc.dim(c.description)}`);
    }
    console.log('');
    console.log(
      pc.dim(
        `  Use ${pc.cyan('teieditor add <component>')} to add one, or ${pc.cyan('teieditor init')} for all.`,
      ),
    );
    console.log('');
  });

// -- parse ------------------------------------------------------------------

program.parse();
