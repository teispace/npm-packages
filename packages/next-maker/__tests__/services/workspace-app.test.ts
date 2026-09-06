import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  adoptIntoWorkspace,
  findWorkspace,
  parseCatalog,
  useCatalog,
} from '../../src/services/init/workspace-app.service';

const WORKSPACE_YAML = `packages:
  - 'apps/*'

minimumReleaseAge: 1440

catalog:
  'next': '16.3.0'
  'react': '19.2.0'
`;

describe('parseCatalog', () => {
  it('reads the catalog block and stops at the next key', () => {
    expect(parseCatalog(WORKSPACE_YAML)).toEqual({ next: '16.3.0', react: '19.2.0' });
    expect(parseCatalog("packages:\n  - 'apps/*'\n")).toEqual({});
  });
});

describe('useCatalog', () => {
  it('points matching ranges at the catalog and leaves the rest alone', () => {
    const { pkg, count } = useCatalog(
      { dependencies: { next: '16.3.0', zod: '4.0.0' }, devDependencies: { react: '19.2.0' } },
      { next: '16.3.0', react: '19.2.0' },
    );
    expect(pkg.dependencies).toEqual({ next: 'catalog:', zod: '4.0.0' });
    expect(pkg.devDependencies).toEqual({ react: 'catalog:' });
    expect(count).toBe(2);
  });
});

describe('findWorkspace and adoptIntoWorkspace', () => {
  let root: string;
  afterEach(async () => root && (await rm(root, { recursive: true, force: true })));

  it('finds the workspace above an app and strips what the root owns', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-ws-'));
    const app = path.join(root, 'apps', 'docs');
    await mkdir(app, { recursive: true });
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), WORKSPACE_YAML);
    for (const file of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', '.npmrc', '.nvmrc']) {
      await writeFile(path.join(app, file), 'x');
    }
    await writeFile(
      path.join(app, 'package.json'),
      JSON.stringify({
        name: 'docs',
        packageManager: 'pnpm@11.0.0',
        engines: { node: '>=24' },
        dependencies: { next: '16.3.0', zod: '4.0.0' },
      }),
    );

    const workspace = await findWorkspace(path.dirname(app));
    expect(workspace?.root).toBe(root);
    expect(workspace?.catalog.next).toBe('16.3.0');

    const report = await adoptIntoWorkspace(app, workspace!);
    expect(report.removed.sort()).toEqual([
      '.npmrc',
      '.nvmrc',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ]);
    expect(report.catalogued).toBe(1);
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf-8'));
    expect(pkg.packageManager).toBeUndefined();
    expect(pkg.engines).toBeUndefined();
    expect(pkg.dependencies).toEqual({ next: 'catalog:', zod: '4.0.0' });
    expect(pkg.name).toBe('docs');
  });

  it('returns null outside a workspace', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nm-ws-'));
    expect(await findWorkspace(root)).toBeNull();
  });
});
