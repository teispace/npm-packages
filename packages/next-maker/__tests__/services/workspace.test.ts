import { describe, expect, it } from 'vitest';
import {
  appDockerfile,
  applyCatalog,
  catalogFor,
  catalogYaml,
  pnpmWorkspaceYaml,
  rootDockerCompose,
  rootPackageJson,
  turboJson,
} from '../../src/services/workspace/templates';

const params = {
  name: 'acme',
  description: 'acme workspace',
  author: 'Acme',
  apps: ['web', 'admin'],
  packageManager: 'pnpm',
  packageManagerPin: 'pnpm@11.25.0',
  nodeEngine: '>=24.0.0',
  turboVersion: '^2.10.0',
  biomeVersion: '^2.5.12',
  hooks: true,
  huskyVersion: '^9',
  lintStagedVersion: '^17',
  commitlintCliVersion: '^20',
  commitlintConfigVersion: '^20',
};

describe('workspace templates', () => {
  it('root package.json runs every gate through turbo and carries hook tooling when asked', () => {
    const pkg = JSON.parse(rootPackageJson(params));
    expect(pkg.private).toBe(true);
    expect(pkg.packageManager).toBe('pnpm@11.25.0');
    expect(pkg.scripts.build).toBe('turbo run build');
    expect(pkg.scripts['lint:fix']).toBe('biome check --write . && turbo run lint:fix');
    expect(pkg.scripts.prepare).toBe('husky');
    expect(Object.keys(pkg.devDependencies)).toEqual([
      '@biomejs/biome',
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
      'turbo',
    ]);
    const noHooks = JSON.parse(rootPackageJson({ ...params, hooks: false }));
    expect(noHooks.scripts.prepare).toBeUndefined();
    expect(noHooks.devDependencies.husky).toBeUndefined();
  });

  it('workspace yaml keeps the starter install policy and points at apps and packages', () => {
    const out = pnpmWorkspaceYaml(
      '# Single-package project today\npackages: []\n\n# gate\nminimumReleaseAge: 1440\n\nallowBuilds:\n  msw: false\n',
    );
    expect(out).toContain("packages:\n  - 'apps/*'\n  - 'packages/*'");
    expect(out).toContain('minimumReleaseAge: 1440');
    expect(out).toContain('msw: false');
    expect(out).not.toContain('packages: []');
  });

  it('turbo.json passes public env through and caches build output', () => {
    const turbo = JSON.parse(turboJson());
    expect(turbo.globalPassThroughEnv).toContain('NEXT_PUBLIC_*');
    expect(turbo.tasks.build.outputs).toEqual(['.next/**', '!.next/cache/**']);
    expect(turbo.tasks.dev.persistent).toBe(true);
  });

  it('catalogs ranges shared by every app and rewrites them to catalog:', () => {
    const web = {
      dependencies: { next: '^16', react: '^19', 'web-only': '1' },
      devDependencies: { vitest: '^5' },
    };
    const admin = {
      dependencies: { next: '^16', react: '^18' },
      devDependencies: { vitest: '^5' },
    };
    const catalog = catalogFor([web, admin]);
    expect(catalog).toEqual({ next: '^16', vitest: '^5' });
    expect(applyCatalog(web, catalog)).toEqual({
      dependencies: { next: 'catalog:', react: '^19', 'web-only': '1' },
      devDependencies: { vitest: 'catalog:' },
    });
    expect(catalogYaml(catalog)).toBe("\ncatalog:\n  'next': '^16'\n  'vitest': '^5'\n");
    expect(catalogYaml({})).toBe('');
  });

  it('app Dockerfile prunes the workspace and compose exposes one port per app', () => {
    const dockerfile = appDockerfile('web');
    expect(dockerfile).toContain('RUN turbo prune web --docker');
    expect(dockerfile).toContain('pnpm turbo run build --filter=web');
    expect(dockerfile).toContain('CMD ["node", "apps/web/server.js"]');
    const compose = rootDockerCompose(['web', 'admin']);
    expect(compose).toContain('dockerfile: apps/admin/Dockerfile');
    expect(compose).toContain('"3001:3000"');
  });
});
