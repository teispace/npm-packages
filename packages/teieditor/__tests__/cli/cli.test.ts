import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '../../dist/cli/index.js');
const TEMP_DIR = join(__dirname, '../.tmp-cli-test');

function runCli(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, {
    cwd: TEMP_DIR,
    encoding: 'utf-8',
    timeout: 10000,
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
    it('shows help text', () => {
      const output = runCli('--help');
      expect(output).toContain('teieditor');
      expect(output).toContain('init');
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
    it('lists available components', () => {
      const output = runCli('list');
      expect(output).toContain('toolbar');
      expect(output).toContain('editor');
    });
  });

  describe('init', () => {
    it('creates component files in default directory', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('init');

      expect(existsSync(join(outDir, 'toolbar.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'editor.tsx'))).toBe(true);
    });

    it('creates component files in custom directory', () => {
      const outDir = join(TEMP_DIR, 'custom/path');
      runCli(`init --path custom/path`);

      expect(existsSync(join(outDir, 'toolbar.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'editor.tsx'))).toBe(true);
    });

    it('skips existing files on re-run', () => {
      runCli('init');
      const output = runCli('init');
      expect(output).toContain('skip');
    });
  });

  describe('add', () => {
    it('adds a single component', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('add toolbar');

      expect(existsSync(join(outDir, 'toolbar.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'editor.tsx'))).toBe(false); // only toolbar
    });

    it('adds editor with its toolbar dependency', () => {
      const outDir = join(TEMP_DIR, 'src/components/teieditor');
      runCli('add editor');

      expect(existsSync(join(outDir, 'editor.tsx'))).toBe(true);
      expect(existsSync(join(outDir, 'toolbar.tsx'))).toBe(true); // auto-added dependency
    });

    it('respects custom path', () => {
      runCli('add toolbar --path lib/editor');
      expect(existsSync(join(TEMP_DIR, 'lib/editor/toolbar.tsx'))).toBe(true);
    });

    it('exits with error for unknown component', () => {
      expect(() => runCli('add unknown-thing')).toThrow();
    });
  });
});
