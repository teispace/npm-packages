import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '../../src/cli/index.ts');
const TEMP_DIR = join(__dirname, '../.tmp-cli-test');

function runCli(args: string): string {
  return execSync(`node --import tsx ${CLI_PATH} ${args}`, {
    cwd: TEMP_DIR,
    encoding: 'utf-8',
    timeout: 15000,
  });
}

describe('CLI', () => {
  beforeEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
  });

  describe('--help', () => {
    it('shows help text with all top-level commands', () => {
      const output = runCli('--help');
      expect(output).toContain('teieditor');
      expect(output).toContain('init');
      expect(output).toContain('update');
      expect(output).toContain('add');
      expect(output).toContain('list');
    });
  });

  describe('--version', () => {
    it('shows version', () => {
      const output = runCli('--version');
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('list', () => {
    it('lists scaffoldable groups', () => {
      const output = runCli('list');
      expect(output).toContain('ui');
      expect(output).toContain('toolbar');
      expect(output).toContain('bubble-menu');
      expect(output).toContain('editor');
    });
  });

  describe('init', () => {
    it('scaffolds the full UI tree (ui + components + editors)', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('init');

      // UI primitives
      expect(existsSync(join(outDir, 'ui/button.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'ui/dropdown.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'ui/icons.tsx'))).toBe(true);
      // Floating components
      expect(existsSync(join(outDir, 'components/toolbar/toolbar.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'components/bubble-menu/bubble-menu.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'components/slash-menu/slash-menu.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'components/link-editor/link-editor.tsx'))).toBe(true);
      // Editor presets
      expect(existsSync(join(outDir, 'editors/editor.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'editors/editor-notion.tsx'))).toBe(true);
    });

    it('respects a custom --path', () => {
      const outDir = join(TEMP_DIR, 'lib/custom-editor');
      runCli(`init --path lib/custom-editor`);
      expect(existsSync(join(outDir, 'ui/button.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'editors/editor.tsx'))).toBe(true);
    });

    it('reports "ok" for untouched files on re-run (no duplicate work)', () => {
      runCli('init');
      const output = runCli('init');
      // Files are unchanged between two init runs → "ok"
      expect(output).toContain('ok');
    });

    it('does not overwrite user-modified files by default', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('init');
      const target = join(outDir, 'ui/button.tsx');
      writeFileSync(target, '// my edits\n' + readFileSync(target, 'utf-8'));

      const output = runCli('init');
      expect(output).toContain('skipped');
      expect(readFileSync(target, 'utf-8')).toMatch(/^\/\/ my edits/);
    });

    it('--force overwrites user-modified files', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('init');
      const target = join(outDir, 'ui/button.tsx');
      writeFileSync(target, '// my edits');

      runCli('init --force');
      expect(readFileSync(target, 'utf-8')).not.toBe('// my edits');
    });
  });

  describe('update', () => {
    it('errors if no scaffold exists yet', () => {
      expect(() => runCli('update')).toThrow();
    });

    it('is a no-op on a clean scaffold (no changes to apply)', () => {
      runCli('init');
      const output = runCli('update');
      expect(output).not.toContain('modified locally');
    });

    it('reports user-modified files as "modified" without touching them', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('init');
      const target = join(outDir, 'ui/button.tsx');
      writeFileSync(target, '// my edits');

      const output = runCli('update');
      expect(output).toContain('modified');
      expect(readFileSync(target, 'utf-8')).toBe('// my edits');
    });
  });

  describe('add', () => {
    it('scaffolds a single group with its deps', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('add toolbar');
      expect(existsSync(join(outDir, 'components/toolbar/toolbar.tsx'))).toBe(true);
      // toolbar depends on ui, so ui should be pulled in too
      expect(existsSync(join(outDir, 'ui/button.tsx'))).toBe(true);
      // editor is not a dep of toolbar, so it should NOT be scaffolded
      expect(existsSync(join(outDir, 'editors/editor.tsx'))).toBe(false);
    });

    it('scaffolds editor and pulls in every dep transitively', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('add editor');
      expect(existsSync(join(outDir, 'editors/editor.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'components/toolbar/toolbar.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'components/bubble-menu/bubble-menu.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'ui/button.tsx'))).toBe(true);
    });

    it('respects a custom --path', () => {
      runCli('add toolbar --path lib/editor');
      expect(existsSync(join(TEMP_DIR, 'lib/editor/components/toolbar/toolbar.tsx'))).toBe(true);
    });

    it('exits with error for unknown group', () => {
      expect(() => runCli('add unknown-thing')).toThrow();
    });
  });
});
