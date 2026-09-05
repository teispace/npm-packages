import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyLocalStarter } from '../../src/config/starter';

let root: string;
afterEach(async () => root && (await rm(root, { recursive: true, force: true })));

describe('copyLocalStarter', () => {
  it('copies tracked and untracked files but not ignored ones from a git checkout', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-copy-'));
    const src = path.join(root, 'src');
    await mkdir(path.join(src, '.husky', '_'), { recursive: true });
    await writeFile(path.join(src, '.gitignore'), 'node_modules\n.husky/_\n.env\n');
    await writeFile(path.join(src, 'keep.ts'), 'tracked');
    execFileSync('git', ['init', '-q'], { cwd: src });
    execFileSync('git', ['add', '.'], { cwd: src });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], {
      cwd: src,
    });
    await writeFile(path.join(src, 'new.ts'), 'untracked');
    await writeFile(path.join(src, '.husky', '_', 'h'), 'ignored');
    await writeFile(path.join(src, '.env'), 'secret');

    const dest = path.join(root, 'dest');
    await copyLocalStarter(src, dest);
    expect(await readFile(path.join(dest, 'keep.ts'), 'utf8')).toBe('tracked');
    expect(await readFile(path.join(dest, 'new.ts'), 'utf8')).toBe('untracked');
    await expect(readFile(path.join(dest, '.husky', '_', 'h'))).rejects.toThrow();
    await expect(readFile(path.join(dest, '.env'))).rejects.toThrow();
  });

  it('falls back to a filtered copy outside git', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-copy-'));
    const src = path.join(root, 'src');
    await mkdir(path.join(src, 'node_modules', 'x'), { recursive: true });
    await writeFile(path.join(src, 'a.ts'), 'a');
    await writeFile(path.join(src, 'node_modules', 'x', 'i.js'), 'dep');
    await copyLocalStarter(src, path.join(root, 'dest'));
    expect(await readFile(path.join(root, 'dest', 'a.ts'), 'utf8')).toBe('a');
    await expect(readFile(path.join(root, 'dest', 'node_modules', 'x', 'i.js'))).rejects.toThrow();
  });
});
