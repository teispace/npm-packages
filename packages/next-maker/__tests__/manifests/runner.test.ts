import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkManifest, reverseManifest } from '../../src/manifests/runner';
import type { FeatureManifest } from '../../src/manifests/types';

let projectPath: string;

beforeEach(async () => {
  projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-manifest-'));
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

const seedPackageJson = async (
  pkg: Record<string, unknown> = {
    scripts: {},
    devDependencies: {},
    dependencies: {},
  },
) => {
  await writeFile(path.join(projectPath, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
};

const sampleManifest = (overrides: Partial<FeatureManifest> = {}): FeatureManifest => ({
  id: 'sample',
  name: 'Sample',
  description: 'demo',
  detect: async () => true,
  files: [{ path: 'scripts/sample.ts', generated: true }],
  packages: [{ name: 'tsx', kind: 'devDependency' }],
  scripts: [{ name: 'sample', expectedValue: 'tsx scripts/sample.ts' }],
  injections: [],
  ...overrides,
});

describe('checkManifest', () => {
  it('returns no drift when the feature is not installed', async () => {
    const m = sampleManifest({ detect: async () => false });
    const result = await checkManifest(m, projectPath);
    expect(result.installed).toBe(false);
    expect(result.drift).toEqual([]);
  });

  it('reports missing files, packages, scripts, and injections', async () => {
    const m = sampleManifest({
      injections: [
        {
          file: 'next.config.ts',
          description: 'headers block',
          presence: /headers:/,
        },
      ],
    });
    await seedPackageJson();
    const result = await checkManifest(m, projectPath);

    expect(result.installed).toBe(true);
    const kinds = result.drift.map((f) => f.kind);
    expect(kinds).toContain('missingFile');
    expect(kinds).toContain('missingPackage');
    expect(kinds).toContain('missingScript');
    expect(kinds).toContain('missingInjection');
  });

  it('skips optional files', async () => {
    const m = sampleManifest({
      files: [{ path: 'optional.txt', required: false, generated: true }],
      packages: [],
      scripts: [],
    });
    await seedPackageJson();
    const result = await checkManifest(m, projectPath);
    expect(result.drift).toEqual([]);
  });

  it('detects mismatched script value', async () => {
    const m = sampleManifest({ files: [], packages: [] });
    await seedPackageJson({
      scripts: { sample: 'tsx scripts/different.ts' },
      devDependencies: {},
      dependencies: {},
    });
    const result = await checkManifest(m, projectPath);
    expect(result.drift).toEqual([
      {
        kind: 'mismatchedScript',
        name: 'sample',
        expected: 'tsx scripts/sample.ts',
        actual: 'tsx scripts/different.ts',
      },
    ]);
  });

  it('returns no drift when everything matches', async () => {
    await mkdir(path.join(projectPath, 'scripts'), { recursive: true });
    await writeFile(path.join(projectPath, 'scripts/sample.ts'), 'console.log(1);');
    await writeFile(path.join(projectPath, 'next.config.ts'), 'export const headers = {};');
    await seedPackageJson({
      scripts: { sample: 'tsx scripts/sample.ts' },
      devDependencies: { tsx: '*' },
      dependencies: {},
    });
    const m = sampleManifest({
      injections: [
        {
          file: 'next.config.ts',
          description: 'headers',
          presence: /headers/,
        },
      ],
    });
    const result = await checkManifest(m, projectPath);
    expect(result.drift).toEqual([]);
  });
});

describe('reverseManifest', () => {
  it('removes generated files and scripts and reports packages to uninstall', async () => {
    await mkdir(path.join(projectPath, 'scripts'), { recursive: true });
    await writeFile(path.join(projectPath, 'scripts/sample.ts'), '// keep');
    await seedPackageJson({
      scripts: { sample: 'tsx scripts/sample.ts', other: 'echo' },
      devDependencies: { tsx: '*' },
      dependencies: {},
    });

    const summary = await reverseManifest(sampleManifest(), projectPath, { dryRun: true });

    expect(summary.filesRemoved).toContain('scripts/sample.ts');
    expect(summary.scriptsRemoved).toContain('sample');
    expect(summary.packagesUninstalled).toContain('tsx');
  });

  it('strips a code block when removePattern is provided', async () => {
    await writeFile(
      path.join(projectPath, 'next.config.ts'),
      `const x = {\n  reactCompiler: true,\n};\n`,
    );
    const m = sampleManifest({
      files: [],
      packages: [],
      scripts: [],
      injections: [
        {
          file: 'next.config.ts',
          description: 'reactCompiler flag',
          presence: /reactCompiler\s*:\s*true/,
          removePattern: /\n\s*reactCompiler:\s*true,?/,
        },
      ],
    });

    const summary = await reverseManifest(m, projectPath);
    expect(summary.blocksStripped).toEqual([
      { file: 'next.config.ts', description: 'reactCompiler flag' },
    ]);

    const after = await readFile(path.join(projectPath, 'next.config.ts'), 'utf-8');
    expect(after).not.toContain('reactCompiler');
  });

  it('flags injections without removePattern as manual cleanup', async () => {
    await writeFile(path.join(projectPath, 'x.ts'), 'export const x = "danger";');
    const m = sampleManifest({
      files: [],
      packages: [],
      scripts: [],
      injections: [{ file: 'x.ts', description: 'tricky block', presence: /danger/ }],
    });

    const summary = await reverseManifest(m, projectPath, { dryRun: true });
    expect(summary.manualCleanup).toEqual([{ file: 'x.ts', description: 'tricky block' }]);
    expect(summary.blocksStripped).toEqual([]);
  });

  it('does not delete files marked generated:false', async () => {
    await writeFile(path.join(projectPath, 'user-owned.ts'), '// keep me');
    const m = sampleManifest({
      files: [{ path: 'user-owned.ts', generated: false }],
      packages: [],
      scripts: [],
    });
    const summary = await reverseManifest(m, projectPath, { dryRun: true });
    expect(summary.filesRemoved).toEqual([]);
  });

  it('never recursively deletes directories flagged containsUserContent', async () => {
    // Simulate a populated [locale] dir with user pages
    await mkdir(path.join(projectPath, 'src/app/[locale]/dashboard'), { recursive: true });
    await writeFile(path.join(projectPath, 'src/app/[locale]/dashboard/page.tsx'), '// user page');

    const m = sampleManifest({
      files: [
        {
          path: 'src/app/[locale]',
          generated: true,
          isDir: true,
          containsUserContent: true,
          removeHint: 'move pages out first',
        },
      ],
      packages: [],
      scripts: [],
    });

    const summary = await reverseManifest(m, projectPath);

    expect(summary.filesRemoved).toEqual([]);
    expect(summary.manualCleanup).toEqual([
      { file: 'src/app/[locale]', description: 'src/app/[locale] — move pages out first' },
    ]);

    // User content survives
    const stillThere = await readFile(
      path.join(projectPath, 'src/app/[locale]/dashboard/page.tsx'),
      'utf-8',
    );
    expect(stillThere).toBe('// user page');
  });

  it('uses a generic hint when removeHint is omitted', async () => {
    await mkdir(path.join(projectPath, 'src/store'), { recursive: true });
    const m = sampleManifest({
      files: [{ path: 'src/store', generated: true, isDir: true, containsUserContent: true }],
      packages: [],
      scripts: [],
    });

    const summary = await reverseManifest(m, projectPath, { dryRun: true });
    expect(summary.manualCleanup[0]?.description).toContain('may contain user-authored');
  });

  it('dryRun does not write to disk', async () => {
    await mkdir(path.join(projectPath, 'scripts'), { recursive: true });
    await writeFile(path.join(projectPath, 'scripts/sample.ts'), '// keep');
    await seedPackageJson({
      scripts: { sample: 'tsx scripts/sample.ts' },
      devDependencies: { tsx: '*' },
      dependencies: {},
    });

    await reverseManifest(sampleManifest(), projectPath, { dryRun: true });

    const pkg = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf-8'));
    expect(pkg.scripts.sample).toBe('tsx scripts/sample.ts');
    const stillThere = await readFile(path.join(projectPath, 'scripts/sample.ts'), 'utf-8');
    expect(stillThere).toBe('// keep');
  });
});
