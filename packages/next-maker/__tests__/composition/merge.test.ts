import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergePackageJson, mergeText, mergeTrees } from '../../src/composition/merge';

describe('mergeText', () => {
  it('merges non-overlapping edits and flags overlapping ones', async () => {
    const clean = await mergeText('a\nB\nc\n', 'a\nb\nc\n', 'a\nb\nc\nd\n');
    expect(clean).toEqual({ content: 'a\nB\nc\nd\n', conflicts: 0 });
    const conflict = await mergeText('a\nB\nc\n', 'a\nb\nc\n', 'a\nX\nc\n');
    expect(conflict.conflicts).toBe(1);
    expect(conflict.content).toContain('<<<<<<< project');
  });
});

describe('mergePackageJson', () => {
  it('applies starter key changes where the project kept the base value and keeps project edits otherwise', () => {
    const base = {
      name: 'x',
      scripts: { build: 'next build', test: 'vitest' },
      dependencies: { next: '1', zod: '1' },
    };
    const theirs = {
      name: 'x',
      scripts: { build: 'next build --turbo', test: 'vitest' },
      dependencies: { next: '2', zod: '1', zustand: '5' },
    };
    const ours = {
      name: 'my-app',
      scripts: { build: 'next build', test: 'vitest run', dev: 'next dev' },
      dependencies: { next: '1', zod: '1', lodash: '4' },
    };
    const { result, conflicts } = mergePackageJson(ours, base, theirs);
    expect(result.name).toBe('my-app');
    expect(result.scripts).toEqual({
      build: 'next build --turbo',
      test: 'vitest run',
      dev: 'next dev',
    });
    expect(result.dependencies).toEqual({ lodash: '4', next: '2', zod: '1', zustand: '5' });
    expect(conflicts).toEqual([]);
  });

  it('reports a conflict when both sides changed the same key differently', () => {
    const { result, conflicts } = mergePackageJson(
      { dependencies: { next: '3' } },
      { dependencies: { next: '1' } },
      { dependencies: { next: '2', zod: '1' } },
    );
    expect(result.dependencies).toEqual({ next: '3', zod: '1' });
    expect(conflicts).toEqual(['dependencies.next']);
  });

  it('removes keys the starter dropped when the project did not touch them', () => {
    const { result } = mergePackageJson(
      { dependencies: { redux: '1', next: '1' } },
      { dependencies: { redux: '1', next: '1' } },
      { dependencies: { next: '1' } },
    );
    expect(result.dependencies).toEqual({ next: '1' });
  });
});

const seed = async (root: string, files: Record<string, string>) => {
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), content);
  }
};

describe('mergeTrees', () => {
  let root: string;
  afterEach(async () => root && (await rm(root, { recursive: true, force: true })));

  it('adds, updates, merges, deletes, and keeps files according to who changed them', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-merge-'));
    const base = path.join(root, 'base');
    const theirs = path.join(root, 'theirs');
    const ours = path.join(root, 'ours');
    await seed(base, {
      'untouched.ts': 'same\n',
      'starter-updated.ts': 'v1\n',
      'both.ts': 'a\nb\nc\n',
      'removed-by-starter.ts': 'old\n',
      'removed-but-edited.ts': 'old\n',
      'user-deleted.ts': 'x\n',
      'package.json': JSON.stringify({ name: 'p', dependencies: { next: '1' } }),
      'pnpm-lock.yaml': 'base lock',
    });
    await seed(theirs, {
      'untouched.ts': 'same\n',
      'starter-updated.ts': 'v2\n',
      'both.ts': 'a\nb\nc\nd\n',
      'user-deleted.ts': 'x\n',
      'new-file.ts': 'new\n',
      'package.json': JSON.stringify({ name: 'p', dependencies: { next: '2' } }),
      'pnpm-lock.yaml': 'their lock',
    });
    await seed(ours, {
      'untouched.ts': 'same\n',
      'starter-updated.ts': 'v1\n',
      'both.ts': 'A\nb\nc\n',
      'removed-by-starter.ts': 'old\n',
      'removed-but-edited.ts': 'mine\n',
      'user-only.ts': 'keep\n',
      'package.json': JSON.stringify({ name: 'my', dependencies: { next: '1', lodash: '4' } }),
      'pnpm-lock.yaml': 'our lock',
    });

    const report = await mergeTrees({ base, theirs, ours });
    const outcome = Object.fromEntries(report.entries.map((e) => [e.file, e.outcome]));
    expect(outcome).toEqual({
      'both.ts': 'merged',
      'new-file.ts': 'added',
      'package.json': 'merged',
      'removed-but-edited.ts': 'kept',
      'removed-by-starter.ts': 'deleted',
      'starter-updated.ts': 'updated',
      'untouched.ts': 'unchanged',
      'user-deleted.ts': 'kept',
    });
    expect(report.conflicts).toEqual([]);
    expect(await readFile(path.join(ours, 'both.ts'), 'utf8')).toBe('A\nb\nc\nd\n');
    expect(await readFile(path.join(ours, 'starter-updated.ts'), 'utf8')).toBe('v2\n');
    expect(await readFile(path.join(ours, 'new-file.ts'), 'utf8')).toBe('new\n');
    expect(await readFile(path.join(ours, 'user-only.ts'), 'utf8')).toBe('keep\n');
    expect(await readFile(path.join(ours, 'pnpm-lock.yaml'), 'utf8')).toBe('our lock');
    await expect(readFile(path.join(ours, 'removed-by-starter.ts'))).rejects.toThrow();
    await expect(readFile(path.join(ours, 'user-deleted.ts'))).rejects.toThrow();
    const pkg = JSON.parse(await readFile(path.join(ours, 'package.json'), 'utf8'));
    expect(pkg).toEqual({ name: 'my', dependencies: { lodash: '4', next: '2' } });
  });

  it('writes conflict markers and reports the file when both sides changed the same lines', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-merge-'));
    await seed(path.join(root, 'base'), { 'a.ts': 'one\n' });
    await seed(path.join(root, 'theirs'), { 'a.ts': 'two\n' });
    await seed(path.join(root, 'ours'), { 'a.ts': 'three\n' });
    const report = await mergeTrees({
      base: path.join(root, 'base'),
      theirs: path.join(root, 'theirs'),
      ours: path.join(root, 'ours'),
    });
    expect(report.conflicts).toEqual(['a.ts']);
    expect(await readFile(path.join(root, 'ours', 'a.ts'), 'utf8')).toContain(
      '>>>>>>> starter (new)',
    );
  });

  it('dry run reports without writing', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-merge-'));
    await seed(path.join(root, 'base'), { 'a.ts': 'one\n' });
    await seed(path.join(root, 'theirs'), { 'a.ts': 'two\n' });
    await seed(path.join(root, 'ours'), { 'a.ts': 'one\n' });
    const report = await mergeTrees(
      {
        base: path.join(root, 'base'),
        theirs: path.join(root, 'theirs'),
        ours: path.join(root, 'ours'),
      },
      { dryRun: true },
    );
    expect(report.entries[0].outcome).toBe('updated');
    expect(await readFile(path.join(root, 'ours', 'a.ts'), 'utf8')).toBe('one\n');
  });
});
