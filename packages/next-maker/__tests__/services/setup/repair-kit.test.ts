import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pm = {
  detectPackageManager: vi.fn(async () => 'yarn' as const),
  installPackages: vi.fn(async () => {}),
  installDevPackages: vi.fn(async () => {}),
};

vi.mock('../../../src/core/package-manager', () => pm);

const {
  hasMissingInjection,
  isFileMissing,
  missingFilePaths,
  missingInjectionFiles,
  missingPackageNames,
  repairPackages,
  repairScripts,
} = await import('../../../src/services/setup/repair-kit');

type FeatureFinding = import('../../../src/manifests/types').FeatureFinding;

let projectPath: string;

beforeEach(async () => {
  vi.clearAllMocks();
  projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-repair-kit-'));
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

const seedPkg = async (pkg: Record<string, unknown>) =>
  writeFile(path.join(projectPath, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

const readPkg = async () =>
  JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf-8'));

describe('finding selectors', () => {
  const drift: FeatureFinding[] = [
    { kind: 'missingPackage', name: 'vitest', depKind: 'devDependency' },
    { kind: 'missingPackage', name: 'next-intl', depKind: 'dependency' },
    { kind: 'missingFile', file: 'src/store' },
    { kind: 'missingInjection', file: 'next.config.ts', description: 'plugin wrap' },
  ];

  it('splits missing packages by dep kind', () => {
    expect(missingPackageNames(drift, 'devDependency')).toEqual(['vitest']);
    expect(missingPackageNames(drift, 'dependency')).toEqual(['next-intl']);
  });

  it('lists missing files and injections', () => {
    expect(missingFilePaths(drift)).toEqual(['src/store']);
    expect(missingInjectionFiles(drift)).toEqual(['next.config.ts']);
  });

  it('matches a missing file by exact path or by parent directory', () => {
    expect(isFileMissing(drift, 'src/store')).toBe(true);
    expect(isFileMissing(drift, 'src/stores')).toBe(false);
    expect(isFileMissing([{ kind: 'missingFile', file: 'test/setup.ts' }], 'test')).toBe(true);
  });

  it('scopes injection lookups to a file when asked', () => {
    expect(hasMissingInjection(drift)).toBe(true);
    expect(hasMissingInjection(drift, 'next.config.ts')).toBe(true);
    expect(hasMissingInjection(drift, 'src/providers/RootProvider.tsx')).toBe(false);
  });
});

describe('repairPackages', () => {
  it('installs deps and devDeps through the detected package manager', async () => {
    const installed = await repairPackages(projectPath, [
      { kind: 'missingPackage', name: 'react-redux', depKind: 'dependency' },
      { kind: 'missingPackage', name: 'vitest', depKind: 'devDependency' },
    ]);

    expect(pm.installPackages).toHaveBeenCalledWith(projectPath, 'yarn', ['react-redux']);
    expect(pm.installDevPackages).toHaveBeenCalledWith(projectPath, 'yarn', ['vitest']);
    expect(installed).toEqual(['react-redux', 'vitest']);
  });

  it('does nothing when no package drift was reported', async () => {
    const installed = await repairPackages(projectPath, [
      { kind: 'missingFile', file: 'src/store' },
    ]);

    expect(installed).toEqual([]);
    expect(pm.installPackages).not.toHaveBeenCalled();
    expect(pm.installDevPackages).not.toHaveBeenCalled();
  });
});

describe('repairScripts', () => {
  it('restores a missing script from the expected value carried by the finding', async () => {
    await seedPkg({ scripts: { build: 'next build' } });

    const restored = await repairScripts(projectPath, [
      { kind: 'missingScript', name: 'analyze', expected: 'ANALYZE=true next build' },
    ]);

    expect(restored).toEqual(['analyze']);
    const pkg = await readPkg();
    expect(pkg.scripts.analyze).toBe('ANALYZE=true next build');
    expect(pkg.scripts.build).toBe('next build');
  });

  it('resets a mismatched script to the declared value', async () => {
    await seedPkg({ scripts: { test: 'jest' } });

    await repairScripts(projectPath, [
      { kind: 'mismatchedScript', name: 'test', expected: 'vitest run', actual: 'jest' },
    ]);

    expect((await readPkg()).scripts.test).toBe('vitest run');
  });

  it('leaves a missing script alone when the manifest declared no value', async () => {
    await seedPkg({ scripts: {} });

    const restored = await repairScripts(projectPath, [
      { kind: 'missingScript', name: 'validate' },
    ]);

    expect(restored).toEqual([]);
    expect((await readPkg()).scripts.validate).toBeUndefined();
  });

  it('is a no-op without a package.json', async () => {
    await expect(
      repairScripts(projectPath, [
        { kind: 'missingScript', name: 'analyze', expected: 'ANALYZE=true next build' },
      ]),
    ).resolves.toEqual([]);
  });
});
