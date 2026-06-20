import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isFileUsed, isStringUsed } from '../../../../src/services/setup/http-client/injectors';

// These grep helpers used to interpolate the project path into a shell string
// (`exec("grep ... \"${srcPath}\"")`). A project checked out at a path
// containing `$(...)` would then execute arbitrary commands. They now use
// execFile (argv, no shell), so the path is inert.

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'next-maker-grep-'));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe('grep helpers are shell-injection safe', () => {
  it('does not execute command substitution embedded in the project path', async () => {
    // A directory whose name contains a command substitution. The sentinel file
    // must NOT be created by grep running — its presence would prove the shell
    // interpreted `$(...)`.
    const sentinel = path.join(baseDir, 'PWNED.txt');
    const evilName = `proj-$(touch ${sentinel})`;
    const projectPath = path.join(baseDir, evilName);
    const srcDir = path.join(projectPath, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'a.ts'), `import { fetchClient } from '@/lib/http';\n`);

    // Run a search over the hostile path.
    const used = await isStringUsed(projectPath, 'fetchClient');

    expect(used).toBe(true); // grep still matched the literal content
    // The command substitution never ran.
    const { existsSync } = await import('node:fs');
    expect(existsSync(sentinel)).toBe(false);
  });

  it('matches real imports and returns false when absent', async () => {
    const projectPath = path.join(baseDir, 'clean');
    const srcDir = path.join(projectPath, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'b.ts'), `import { thing } from '@/lib/config/app-apis';\n`);

    expect(await isFileUsed(projectPath, '@/lib/config/app-apis')).toBe(true);
    expect(await isFileUsed(projectPath, '@/lib/does-not-exist')).toBe(false);
  });

  it('treats the search string literally (regex metachars do not break it)', async () => {
    const projectPath = path.join(baseDir, 'literal');
    const srcDir = path.join(projectPath, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'c.ts'), `const x = api.get('a.b+c');\n`);

    // '.' and '+' are regex metachars; -F fixed-string must match verbatim.
    expect(await isStringUsed(projectPath, 'a.b+c')).toBe(true);
    expect(await isStringUsed(projectPath, 'axbxc')).toBe(false);
  });
});
