import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyComposition, planComposition } from '../../src/composition/compose';
import { resolveAnswers, validateManifest } from '../../src/composition/manifest';

const manifest = validateManifest({
  manifestVersion: 1,
  starter: { name: 's', version: '2.0.0' },
  options: {
    state: { type: 'choice', values: ['redux', 'zustand', 'none'], default: 'redux' },
    i18n: { type: 'boolean', default: true },
    tests: { type: 'boolean', default: true },
  },
  always: { remove: ['CHANGELOG.md', 'next-maker.json', '.next-maker/**'] },
  features: {
    zustand: {
      when: { state: ['zustand'] },
      on: { overlay: 'zustand' },
    },
    state: {
      when: { state: ['redux'] },
      off: {
        remove: ['src/store/**'],
        anchors: ['state'],
        unwrapJsx: [{ file: 'src/providers/RootProvider.tsx', tag: 'StoreProvider' }],
        packages: ['redux'],
      },
    },
    i18n: {
      when: { i18n: [true] },
      off: {
        remove: ['src/app/[locale]/**'],
        overlay: 'no-i18n',
        anchors: ['i18n'],
        unwrapCall: [{ file: 'next.config.ts', name: 'withNextIntl' }],
        packages: ['next-intl'],
        env: ['DEFAULT_LOCALE'],
      },
    },
    tests: {
      when: { tests: [true] },
      off: { remove: ['**/*.test.ts'], devPackages: ['vitest'], scripts: ['test'] },
    },
  },
  packageManagers: {
    pnpm: { packageManager: 'pnpm@11.0.0', lockfile: 'pnpm-lock.yaml', engines: { pnpm: '>=11' } },
    npm: { lockfile: 'package-lock.json', overlay: 'pm-npm', remove: ['pnpm-lock.yaml'] },
  },
  validateScript: { name: 'validate', steps: ['lint', 'test', 'build'] },
});

const files: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 's',
    packageManager: 'pnpm@11.0.0',
    engines: { node: '>=24', pnpm: '>=11' },
    scripts: {
      lint: 'biome ci',
      test: 'vitest run',
      build: 'next build',
      validate: 'pnpm lint && pnpm test && pnpm build',
      'type-check': 'pnpm typegen && tsc',
    },
    dependencies: { redux: '1', 'next-intl': '1', next: '1' },
    devDependencies: { vitest: '1' },
  }),
  'CHANGELOG.md': '# x',
  'next-maker.json': '{}',
  'pnpm-lock.yaml': 'lock',
  '.env.example': 'A=\n\n# locale\nDEFAULT_LOCALE=\n',
  'next.config.ts': 'const c = {};\nexport default bundle(withNextIntl(c));\n',
  'src/store/index.ts': 'export const s = 1;',
  'src/store/index.test.ts': 'test',
  'src/app/[locale]/page.tsx': 'intl page',
  'src/providers/RootProvider.tsx': [
    '// @next-maker:i18n',
    "import { Intl } from 'next-intl';",
    '// @next-maker:state',
    "import { StoreProvider } from './StoreProvider';",
    'export const R = ({ children }) => (',
    '  <Q>',
    '    <StoreProvider>',
    '      {children}',
    '    </StoreProvider>',
    '  </Q>',
    ');',
  ].join('\n'),
  '.husky/pre-push': 'pnpm lint\npnpm exec tsc',
  '.next-maker/overlays/no-i18n/src/app/page.tsx': 'plain page',
  '.next-maker/overlays/no-i18n/src/app/page.test.ts': 'overlay test',
  '.next-maker/overlays/zustand/src/store/index.ts': 'zustand store',
  '.next-maker/overlays/zustand/src/store/store.test.ts': 'zustand test',
  '.next-maker/overlays/pm-npm/Dockerfile': 'FROM node\nRUN npm ci',
  Dockerfile: 'FROM node\nRUN pnpm install --frozen-lockfile',
};

const makeStarter = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'nm-compose-'));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), content);
  }
  return root;
};

let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const exists = async (rel: string) => {
  try {
    await readFile(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
};

describe('planComposition', () => {
  it('collects the footprint of every off feature plus always and package-manager removals', () => {
    const { answers } = resolveAnswers(manifest, { state: 'none', i18n: false });
    const plan = planComposition(manifest, answers, 'npm');
    expect(plan.featuresOff).toEqual(['zustand', 'state', 'i18n']);
    expect(plan.featuresOn).toEqual(['tests']);
    expect(plan.removePatterns).toEqual([
      'CHANGELOG.md',
      'next-maker.json',
      '.next-maker/**',
      'pnpm-lock.yaml',
      'src/store/**',
      'src/app/[locale]/**',
    ]);
    expect(plan.featureOverlays).toEqual([{ name: 'no-i18n', options: ['i18n'] }]);
    expect(plan.pmOverlays).toEqual(['pm-npm']);
    expect([...plan.anchorsOff]).toEqual(['state', 'i18n']);
    expect(plan.packages).toEqual(['redux', 'next-intl']);
  });

  it('rejects an unsupported package manager', () => {
    const { answers } = resolveAnswers(manifest);
    expect(() => planComposition(manifest, answers, 'bun')).toThrow(/does not support bun/);
  });
});

describe('applyComposition', () => {
  it('keeps the default shape intact apart from starter-only files and anchor residue', async () => {
    root = await makeStarter();
    const { answers } = resolveAnswers(manifest);
    const report = await applyComposition(
      root,
      manifest,
      planComposition(manifest, answers, 'pnpm'),
    );
    expect(report.removed.sort()).toEqual([
      '.next-maker/overlays/no-i18n/src/app/page.test.ts',
      '.next-maker/overlays/no-i18n/src/app/page.tsx',
      '.next-maker/overlays/pm-npm/Dockerfile',
      '.next-maker/overlays/zustand/src/store/index.ts',
      '.next-maker/overlays/zustand/src/store/store.test.ts',
      'CHANGELOG.md',
      'next-maker.json',
    ]);
    expect(await exists('src/store/index.ts')).toBe(true);
    const provider = await readFile(path.join(root, 'src/providers/RootProvider.tsx'), 'utf-8');
    expect(provider).not.toContain('@next-maker');
    expect(provider).toContain("import { StoreProvider } from './StoreProvider';");
    expect(provider).toContain("import { Intl } from 'next-intl';");
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf-8'));
    expect(pkg.scripts.validate).toBe('pnpm lint && pnpm test && pnpm build');
    expect(pkg.packageManager).toBe('pnpm@11.0.0');
    expect(await exists('.next-maker/overlays/no-i18n/src/app/page.tsx')).toBe(false);
  });

  it('removes files, applies overlays, strips anchors, unwraps, and edits package.json for a trimmed project', async () => {
    root = await makeStarter();
    const { answers } = resolveAnswers(manifest, { state: 'none', i18n: false, tests: false });
    const plan = planComposition(manifest, answers, 'npm');
    const report = await applyComposition(root, manifest, plan);

    expect(await exists('src/store/index.ts')).toBe(false);
    expect(await exists('src/store/index.test.ts')).toBe(false);
    expect(await exists('src/app/[locale]/page.tsx')).toBe(false);
    expect(await readFile(path.join(root, 'src/app/page.tsx'), 'utf-8')).toBe('plain page');
    // The overlay's test file falls under the tests-off removal too.
    expect(await exists('src/app/page.test.ts')).toBe(false);
    expect(await exists('pnpm-lock.yaml')).toBe(false);
    expect(await readFile(path.join(root, 'Dockerfile'), 'utf-8')).toContain('npm ci');

    const provider = await readFile(path.join(root, 'src/providers/RootProvider.tsx'), 'utf-8');
    expect(provider).toBe(
      ['export const R = ({ children }) => (', '  <Q>', '    {children}', '  </Q>', ');'].join(
        '\n',
      ),
    );
    expect(await readFile(path.join(root, 'next.config.ts'), 'utf-8')).toBe(
      'const c = {};\nexport default bundle(c);\n',
    );

    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf-8'));
    expect(pkg.dependencies).toEqual({ next: '1' });
    expect(pkg.devDependencies).toEqual({});
    expect(pkg.scripts.test).toBeUndefined();
    expect(pkg.scripts.validate).toBe('npm run lint && npm run build');
    expect(pkg.scripts['type-check']).toBe('npm run typegen && tsc');
    expect(pkg.packageManager).toBeUndefined();
    expect(pkg.engines).toEqual({ node: '>=24' });

    expect(await readFile(path.join(root, '.env.example'), 'utf-8')).toBe('A=\n\n# locale\n');
    expect(await readFile(path.join(root, '.husky/pre-push'), 'utf-8')).toBe(
      'npm run lint\nnpx --no -- tsc',
    );
    expect(report.unwrapped).toEqual([
      'src/providers/RootProvider.tsx:<StoreProvider>',
      'next.config.ts:withNextIntl()',
    ]);
  });

  it('lets an overlay survive removals from a sibling of its own option while other removals still apply', async () => {
    root = await makeStarter();
    const { answers } = resolveAnswers(manifest, { state: 'zustand', tests: false });
    const plan = planComposition(manifest, answers, 'pnpm');
    await applyComposition(root, manifest, plan);
    // The redux `src/store/**` removal deleted the base store, and the zustand overlay's store survived it...
    expect(await readFile(path.join(root, 'src/store/index.ts'), 'utf-8')).toBe('zustand store');
    // ...while the tests-off removal still took the overlay's test.
    expect(await exists('src/store/store.test.ts')).toBe(false);
  });
});
