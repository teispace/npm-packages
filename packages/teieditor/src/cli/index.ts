#!/usr/bin/env node
/**
 * `npx @teispace/teieditor <command>`: set an app up, and copy the UI's
 * source into it to own. Nothing but Node's own modules.
 *
 *   init [--preset full|notion|minimal]   an editor component, and the packages it needs
 *   add <component…>                      a component's source, to change as you like
 *   list                                  the components there are
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export interface CliContext {
  /** The app's directory. */
  cwd: string;
  /** The package's built files (`dist`). */
  dist: string;
  /** Where messages go. */
  log: (line: string) => void;
  /** Runs the install command; only with `--install`. */
  run?: (command: string, args: readonly string[], cwd: string) => number;
}

interface Template {
  file: string;
  description: string;
  dependencies: string[];
}

const PRESETS = ['full', 'notion', 'minimal'] as const;
type PresetName = (typeof PRESETS)[number];

const USAGE = `Usage: npx @teispace/teieditor <command> [options]

Commands
  init                 Write an editor component, and list the packages it needs
  add <component…>     Copy components' source into your app, to change as you like
  list                 The components there are

Options
  --dir <path>         Where files go (default: src/components/teieditor, or components/teieditor)
  --preset <name>      init: full (default), notion or minimal
  --install            Install the missing packages too
  --force              Overwrite files that are there
  --dry-run            Say what would happen, change nothing
  -h, --help           This help
  -v, --version        The package's version`;

const color = (code: number) => (text: string) =>
  process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
const bold = color(1);
const dim = color(2);
const green = color(32);
const yellow = color(33);

/** Runs a command; the exit code. */
export function main(argv: readonly string[], context: CliContext = defaultContext()): number {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    context.log(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsed;
  const [command, ...names] = positionals;
  if (values.version) {
    context.log(packageJson(context).version);
    return 0;
  }
  if (values.help || !command) {
    context.log(USAGE);
    return command || values.help ? 0 : 1;
  }
  const options = {
    dir: values.dir,
    force: values.force ?? false,
    dryRun: values['dry-run'] ?? false,
    install: values.install ?? false,
  };
  switch (command) {
    case 'list':
      return list(context);
    case 'add':
      return add(names, options, context);
    case 'init': {
      const preset = (values.preset ?? 'full') as PresetName;
      if (!PRESETS.includes(preset)) {
        context.log(`No preset "${preset}": ${PRESETS.join(', ')}.`);
        return 1;
      }
      return init(preset, options, context);
    }
    default:
      context.log(`No command "${command}".\n\n${USAGE}`);
      return 1;
  }
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      preset: { type: 'string' },
      install: { type: 'boolean' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
}

interface Options {
  dir: string | undefined;
  force: boolean;
  dryRun: boolean;
  install: boolean;
}

function list(context: CliContext): number {
  const templates = manifest(context);
  const width = Math.max(...Object.keys(templates).map((name) => name.length));
  context.log(bold('Components (npx @teispace/teieditor add <name>):\n'));
  for (const [name, { description }] of Object.entries(templates)) {
    context.log(`  ${name.padEnd(width)}  ${dim(description)}`);
  }
  return 0;
}

function add(names: readonly string[], options: Options, context: CliContext): number {
  if (names.length === 0) {
    context.log('Name the components to add; `list` shows them.');
    return 1;
  }
  const templates = manifest(context);
  const unknown = names.filter((name) => !templates[name]);
  if (unknown.length) {
    context.log(`No component ${unknown.map((n) => `"${n}"`).join(', ')}; \`list\` shows them.`);
    return 1;
  }
  const dir = targetDir(options, context);
  const files = names.map((name) => {
    const { file } = templates[name] as Template;
    return {
      path: join(dir, file),
      content: readFileSync(join(templatesDir(context), file), 'utf8'),
    };
  });
  if (!write(files, options, context)) return 1;
  const needed = new Set(names.flatMap((name) => (templates[name] as Template).dependencies));
  for (const dep of peersOf(context, ['react/index.js'])) needed.add(dep);
  context.log(
    `\nEach imports the rest from the package, as your own code would: change it freely. Use it in place of the built-in one, e.g. through \`<Editor slots>\`.`,
  );
  return dependencies([...needed], options, context);
}

function init(preset: PresetName, options: Options, context: CliContext): number {
  const dir = targetDir(options, context);
  const content = `'use client';

import '@teispace/teieditor/styles.css';
import { ${preset} } from '@teispace/teieditor/presets/${preset}';
import { Editor, type EditorProps } from '@teispace/teieditor/react';

/**
 * The editor, with the ${preset} preset. Takes every \`<Editor>\` prop:
 * \`content\`, \`onChange\`, \`placeholder\`, \`slots\`…
 */
export function TeiEditor(props: EditorProps) {
  return <Editor preset={${preset}} {...props} />;
}
`;
  if (!write([{ path: join(dir, 'editor.tsx'), content }], options, context)) return 1;
  const peers = peersOf(context, ['react/index.js', `presets/${preset}.js`]);
  const code = dependencies(['@teispace/teieditor', ...peers], options, context);
  context.log(
    `\n${bold('Use it:')}\n  import { TeiEditor } from '${importPath(context.cwd, dir)}/editor';\n  <TeiEditor content={saved} onChange={save} />`,
  );
  context.log(
    dim(
      "\nThe stylesheet is imported in the component. With Next.js's pages router, import '@teispace/teieditor/styles.css' in _app instead.",
    ),
  );
  return code;
}

/** Writes the files; false if one is there already and `--force` was not given. */
function write(
  files: readonly { path: string; content: string }[],
  options: Options,
  context: CliContext,
): boolean {
  const there = files.filter((file) => existsSync(file.path));
  if (there.length && !options.force) {
    for (const file of there)
      context.log(`${yellow('exists')}  ${relative(context.cwd, file.path)}`);
    context.log('Nothing written. --force overwrites.');
    return false;
  }
  for (const file of files) {
    const verb = options.dryRun ? 'would write' : there.includes(file) ? 'replaced' : 'wrote';
    if (!options.dryRun) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content);
    }
    context.log(`${green(verb)}  ${relative(context.cwd, file.path)}`);
  }
  return true;
}

/** Says which packages the app lacks, and installs them with `--install`. */
function dependencies(needed: readonly string[], options: Options, context: CliContext): number {
  const app = readJson(join(context.cwd, 'package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;
  const have = { ...app?.dependencies, ...app?.devDependencies };
  const missing = [...new Set(needed)].filter((name) => !(name in have)).sort();
  if (missing.length === 0) {
    context.log(`\n${green('✓')} Every package it needs is installed.`);
    return 0;
  }
  const [manager, ...args] = installCommand(context.cwd, missing);
  const command = [manager, ...args].join(' ');
  if (!options.install || options.dryRun) {
    context.log(`\n${bold('Install what it needs:')}\n  ${command}`);
    return 0;
  }
  context.log(`\n${dim(`$ ${command}`)}`);
  const run =
    context.run ??
    ((cmd: string, list: readonly string[], cwd: string) =>
      spawnSync(cmd, list, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }).status ??
      1);
  return run(manager as string, args, context.cwd);
}

/** The app's package manager's add command, from its lockfile. */
export function installCommand(cwd: string, packages: readonly string[]): string[] {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) return ['pnpm', 'add', ...packages];
    if (existsSync(join(dir, 'yarn.lock'))) return ['yarn', 'add', ...packages];
    if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) {
      return ['bun', 'add', ...packages];
    }
    if (existsSync(join(dir, 'package-lock.json')) || dirname(dir) === dir) {
      return ['npm', 'install', ...packages];
    }
  }
}

/**
 * The peer packages the built modules reachable from `entries` import,
 * lazily loaded ones included: what an app needs installed to use them.
 */
export function peersOf(context: CliContext, entries: readonly string[]): string[] {
  const peers = Object.keys(packageJson(context).peerDependencies ?? {});
  const found = new Set<string>();
  const seen = new Set<string>();
  const queue = entries.map((entry) => join(context.dist, entry));
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const [, spec] of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
      if (!spec) continue;
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else {
        const name = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0];
        if (name && peers.includes(name)) found.add(name);
      }
    }
  }
  return [...found].sort();
}

function targetDir(options: Options, context: CliContext): string {
  if (options.dir) return resolve(context.cwd, options.dir);
  const base = existsSync(join(context.cwd, 'src')) ? 'src/components' : 'components';
  return resolve(context.cwd, base, 'teieditor');
}

/** How the app imports from `dir`: through `@/` when it maps to `src` or the root. */
function importPath(cwd: string, dir: string): string {
  const path = relative(cwd, dir).split('\\').join('/');
  let tsconfig = '';
  try {
    tsconfig = readFileSync(join(cwd, 'tsconfig.json'), 'utf8');
  } catch {
    // No tsconfig: a relative path.
  }
  if (/"@\/\*"\s*:\s*\[\s*"\.\/src\/\*"/.test(tsconfig) && path.startsWith('src/')) {
    return `@/${path.slice(4)}`;
  }
  if (/"@\/\*"\s*:\s*\[\s*"\.\/\*"/.test(tsconfig)) return `@/${path}`;
  return `./${path}`;
}

const templatesDir = (context: CliContext) => join(context.dist, 'templates');

function manifest(context: CliContext): Record<string, Template> {
  return readJson(join(templatesDir(context), 'manifest.json')) as Record<string, Template>;
}

function packageJson(context: CliContext): {
  version: string;
  peerDependencies?: Record<string, string>;
} {
  return readJson(join(context.dist, '..', 'package.json')) as { version: string };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function defaultContext(): CliContext {
  return {
    cwd: process.cwd(),
    dist: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    log: (line) => console.log(line),
  };
}

/** Whether this module is the program (npx runs it through a link), not imported by a test. */
function isProgram(): boolean {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(process.argv[1] as string) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isProgram()) process.exitCode = main(process.argv.slice(2));
