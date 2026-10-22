import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CliContext, installCommand, main, peersOf } from '../../src/cli/index.js';

let root: string;
let app: string;
let dist: string;
let lines: string[];
let runs: { command: string; args: readonly string[] }[];
let context: CliContext;

const file = (path: string, content: string) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
};
const output = () => lines.join('\n');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tei-cli-'));
  app = join(root, 'app');
  dist = join(root, 'pkg', 'dist');
  // A package as built: its manifest, two templates, and a module graph with peers.
  file(
    join(root, 'pkg', 'package.json'),
    JSON.stringify({
      version: '5.0.0',
      peerDependencies: { lexical: '*', '@lexical/table': '*', react: '*', '@lexical/link': '*' },
    }),
  );
  file(
    join(dist, 'templates', 'manifest.json'),
    JSON.stringify({
      'bubble-menu': {
        file: 'bubble-menu.tsx',
        description: 'The bubble.',
        dependencies: ['@teispace/teieditor', 'lexical'],
      },
      'toolbar-fit': {
        file: 'toolbar-fit.ts',
        description: 'Fitting.',
        dependencies: ['@teispace/teieditor'],
      },
    }),
  );
  file(join(dist, 'templates', 'bubble-menu.tsx'), 'export const Bubble = 1;\n');
  file(join(dist, 'templates', 'toolbar-fit.ts'), 'export const fit = 1;\n');
  file(join(dist, 'react', 'index.js'), 'import{a}from"./a.js";import"react";');
  file(
    join(dist, 'react', 'a.js'),
    'import{b}from"lexical";const c=()=>import("../extensions/link/index.js");',
  );
  file(
    join(dist, 'extensions', 'link', 'index.js'),
    'import{d}from"@lexical/link/sub";import"left-pad";',
  );
  file(
    join(dist, 'presets', 'full.js'),
    'import{t}from"@lexical/table";import"../react/index.js";',
  );
  file(join(dist, 'presets', 'minimal.js'), 'import"lexical";');
  file(join(app, 'package.json'), JSON.stringify({ dependencies: { react: '19.0.0' } }));
  lines = [];
  runs = [];
  context = {
    cwd: app,
    dist,
    log: (line) => lines.push(line),
    run: (command, args) => {
      runs.push({ command, args });
      return 0;
    },
  };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('teieditor CLI', () => {
  it('prints usage, fails without a command, knows its version', () => {
    expect(main([], context)).toBe(1);
    expect(output()).toContain('Usage:');
    lines = [];
    expect(main(['--help'], context)).toBe(0);
    expect(main(['-v'], context)).toBe(0);
    expect(lines.at(-1)).toBe('5.0.0');
    expect(main(['fly'], context)).toBe(1);
    expect(main(['add', '--nope'], context)).toBe(1);
  });

  it('lists the components with their descriptions', () => {
    expect(main(['list'], context)).toBe(0);
    expect(output()).toMatch(/bubble-menu\s+The bubble\./);
    expect(output()).toMatch(/toolbar-fit\s+Fitting\./);
  });

  it('adds a component under components/teieditor, src/ when there is one', () => {
    expect(main(['add', 'bubble-menu'], context)).toBe(0);
    expect(readFileSync(join(app, 'components/teieditor/bubble-menu.tsx'), 'utf8')).toContain(
      'Bubble',
    );
    mkdirSync(join(app, 'src'));
    expect(main(['add', 'toolbar-fit'], context)).toBe(0);
    expect(existsSync(join(app, 'src/components/teieditor/toolbar-fit.ts'))).toBe(true);
    expect(main(['add', 'toolbar-fit', '--dir', 'ui/editor'], context)).toBe(0);
    expect(existsSync(join(app, 'ui/editor/toolbar-fit.ts'))).toBe(true);
  });

  it('never overwrites without --force, and changes nothing on --dry-run', () => {
    main(['add', 'bubble-menu'], context);
    const path = join(app, 'components/teieditor/bubble-menu.tsx');
    writeFileSync(path, 'mine');
    lines = [];
    expect(main(['add', 'bubble-menu'], context)).toBe(1);
    expect(output()).toContain('Nothing written');
    expect(readFileSync(path, 'utf8')).toBe('mine');
    expect(main(['add', 'bubble-menu', '--force', '--dry-run'], context)).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('mine');
    expect(main(['add', 'bubble-menu', '--force'], context)).toBe(0);
    expect(readFileSync(path, 'utf8')).toContain('Bubble');
  });

  it('refuses unknown components, and writes none of a list with one', () => {
    expect(main(['add', 'bubble-menu', 'nope'], context)).toBe(1);
    expect(output()).toContain('"nope"');
    expect(existsSync(join(app, 'components'))).toBe(false);
    expect(main(['add'], context)).toBe(1);
  });

  it('init writes an editor with the preset, and lists what to install', () => {
    file(join(app, 'tsconfig.json'), '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}');
    mkdirSync(join(app, 'src'));
    expect(main(['init', '--preset', 'notion'], context)).toBe(0);
    const editor = readFileSync(join(app, 'src/components/teieditor/editor.tsx'), 'utf8');
    expect(editor).toContain("import { notion } from '@teispace/teieditor/presets/notion';");
    expect(editor).toContain('<Editor preset={notion} {...props} />');
    expect(editor).toContain("import '@teispace/teieditor/styles.css';");
    expect(output()).toContain("from '@/components/teieditor/editor'");
    // Nothing installed without --install.
    expect(runs).toEqual([]);
    expect(main(['init', '--preset', 'huge'], context)).toBe(1);
  });

  it('installs only what is missing, with the app’s package manager', () => {
    file(join(app, 'yarn.lock'), '');
    expect(main(['init', '--install'], context)).toBe(0);
    expect(runs).toEqual([
      {
        command: 'yarn',
        args: ['add', '@lexical/link', '@lexical/table', '@teispace/teieditor', 'lexical'],
      },
    ]);
    // react is there already; left-pad is not a peer.
  });

  it('follows built modules, lazy ones too, to the peers they import', () => {
    expect(peersOf(context, ['react/index.js'])).toEqual(['@lexical/link', 'lexical', 'react']);
    expect(peersOf(context, ['presets/minimal.js'])).toEqual(['lexical']);
  });

  it('finds the package manager from the nearest lockfile', () => {
    expect(installCommand(app, ['x'])[0]).toBe('npm');
    file(join(root, 'pnpm-lock.yaml'), '');
    expect(installCommand(app, ['x'])).toEqual(['pnpm', 'add', 'x']);
    file(join(app, 'bun.lock'), '');
    expect(installCommand(app, ['x'])[0]).toBe('bun');
  });
});
