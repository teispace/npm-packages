import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Repair-path coverage for `doctor --fix`.
 *
 * Every one of these services opens its installer with a first-run guard
 * ("already set up") that fires on exactly the state doctor reports drift
 * in — so `apply` used to be a guaranteed no-op. These tests pin the
 * behaviour that matters: the repair fixes the reported findings without
 * consulting that guard, and touches nothing else.
 */

// --- test doubles -----------------------------------------------------------

const pm = {
  detectPackageManager: vi.fn(async () => 'yarn' as const),
  installPackages: vi.fn(async () => {}),
  installDevPackages: vi.fn(async () => {}),
  installPackage: vi.fn(async () => {}),
  installDevPackage: vi.fn(async () => {}),
  uninstallPackage: vi.fn(async () => {}),
  uninstallPackages: vi.fn(async () => {}),
  runScript: vi.fn(async () => {}),
};
vi.mock('../../../src/core/package-manager', () => pm);

vi.mock('../../../src/config/spinner', () => ({
  startSpinner: () => ({ text: '', succeed: vi.fn(), fail: vi.fn(), stop: vi.fn() }),
}));

/** Files the fake starter clone materialises, keyed by relative path. */
const STARTER_FILES: Record<string, string> = {
  'vitest.config.ts': 'export default {};\n',
  'test/setup.ts': "import '@testing-library/jest-dom/vitest';\n",
  'src/providers/CustomThemeProvider.tsx': 'export const CustomThemeProvider = () => null;\n',
  'src/providers/StoreProvider.tsx': 'export const StoreProvider = () => null;\n',
  'src/store/index.ts': 'export const makeStore = () => ({});\n',
  'src/store/rootReducer.ts': 'export const rootReducer = {};\n',
  'src/store/slices/ws.slice.ts': 'export const wsReducer = () => ({});\n',
  'src/lib/utils/ws/index.ts': 'export const wsClient = {};\n',
  'src/lib/utils/ws/client.test.ts': '// starter test file\n',
  'src/i18n/request.ts': 'export default {};\n',
  'src/i18n/messages/en.json': '{}\n',
  'src/proxy.ts': 'export default {};\n',
  'src/lib/utils/http/shared/index.ts': 'export {};\n',
  'src/lib/utils/http/server.ts': 'export {};\n',
  'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx': "'use client';\n",
  'src/lib/config/api-url.ts': 'export const getApiBaseUrl = () => "";\n',
};

const cloneCalls: string[] = [];

vi.mock('degit', () => ({
  default: () => ({
    clone: async (dest: string) => {
      cloneCalls.push(dest);
      for (const [rel, content] of Object.entries(STARTER_FILES)) {
        const target = path.join(dest, rel);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
      }
    },
  }),
}));

// --- imports (after the mocks) ---------------------------------------------

const { repairReactCompiler } = await import('../../../src/services/setup/react-compiler/repair');
const { repairBundleAnalyzer } = await import('../../../src/services/setup/bundle-analyzer/repair');
const { repairSecurityHeaders } = await import(
  '../../../src/services/setup/security-headers/repair'
);
const { repairValidationScripts } = await import(
  '../../../src/services/setup/validate-scripts/repair'
);
const { repairCommitizen } = await import('../../../src/services/setup/commitizen/repair');
const { repairTests } = await import('../../../src/services/setup/tests/repair');
const { repairDarkTheme } = await import('../../../src/services/setup/dark-theme/repair');
const { repairRedux } = await import('../../../src/services/setup/redux/repair');
const { repairWs } = await import('../../../src/services/setup/ws/repair');
const { repairI18n } = await import('../../../src/services/setup/i18n/repair');
const { repairHttpClient } = await import('../../../src/services/setup/http-client/repair');

type FeatureFinding = import('../../../src/manifests/types').FeatureFinding;

// --- fixtures ---------------------------------------------------------------

let project: string;

beforeEach(async () => {
  vi.clearAllMocks();
  cloneCalls.length = 0;
  project = await mkdtemp(path.join(tmpdir(), 'next-maker-repair-'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

const write = async (rel: string, content: string) => {
  const target = path.join(project, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
};

const read = (rel: string) => readFile(path.join(project, rel), 'utf-8');

const exists = async (rel: string) => {
  try {
    await readFile(path.join(project, rel));
    return true;
  } catch {
    const { existsSync } = await import('node:fs');
    return existsSync(path.join(project, rel));
  }
};

const seedPkg = async (pkg: Record<string, unknown> = {}) =>
  write(
    'package.json',
    `${JSON.stringify({ scripts: {}, dependencies: {}, devDependencies: {}, ...pkg }, null, 2)}\n`,
  );

const NEXT_CONFIG = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

// --- simple footprints ------------------------------------------------------

describe('repairReactCompiler', () => {
  it('reinstalls the babel plugin without touching an already-correct config', async () => {
    await seedPkg();
    await write(
      'next.config.ts',
      NEXT_CONFIG.replace('reactStrictMode: true,', 'reactCompiler: true,'),
    );

    await repairReactCompiler(project, [
      { kind: 'missingPackage', name: 'babel-plugin-react-compiler', depKind: 'devDependency' },
    ]);

    expect(pm.installDevPackages).toHaveBeenCalledWith(project, 'yarn', [
      'babel-plugin-react-compiler',
    ]);
    expect(await read('next.config.ts')).toContain('reactCompiler: true');
  });

  it('re-injects the flag when the block is reported missing', async () => {
    await seedPkg();
    await write('next.config.ts', NEXT_CONFIG);

    await repairReactCompiler(project, [
      { kind: 'missingInjection', file: 'next.config.ts', description: 'flag' },
    ]);

    expect(await read('next.config.ts')).toContain('reactCompiler: true');
  });
});

describe('repairBundleAnalyzer', () => {
  it('restores the config wrap, the analyze script, and the dev dep', async () => {
    await seedPkg();
    await write('next.config.ts', NEXT_CONFIG);

    await repairBundleAnalyzer(project, [
      { kind: 'missingInjection', file: 'next.config.ts', description: 'wrap' },
      { kind: 'missingScript', name: 'analyze', expected: 'ANALYZE=true next build' },
      { kind: 'missingPackage', name: '@next/bundle-analyzer', depKind: 'devDependency' },
    ]);

    const config = await read('next.config.ts');
    expect(config).toContain("from '@next/bundle-analyzer'");
    expect(config).toContain('export default bundleAnalyzer(nextConfig);');
    expect(JSON.parse(await read('package.json')).scripts.analyze).toBe('ANALYZE=true next build');
    expect(pm.installDevPackages).toHaveBeenCalledWith(project, 'yarn', ['@next/bundle-analyzer']);
  });

  it('repairs only what drifted', async () => {
    await seedPkg({ scripts: { analyze: 'ANALYZE=true next build' } });
    await write('next.config.ts', NEXT_CONFIG);

    await repairBundleAnalyzer(project, [
      { kind: 'missingPackage', name: '@next/bundle-analyzer', depKind: 'devDependency' },
    ]);

    expect(await read('next.config.ts')).toBe(NEXT_CONFIG);
  });
});

describe('repairSecurityHeaders', () => {
  it('re-injects the headers block', async () => {
    await write('next.config.ts', NEXT_CONFIG);

    await repairSecurityHeaders(project, [
      { kind: 'missingInjection', file: 'next.config.ts', description: 'headers()' },
    ]);

    expect(await read('next.config.ts')).toContain('headers: async () =>');
  });

  it('leaves the file alone when there is no injection drift', async () => {
    await write('next.config.ts', NEXT_CONFIG);

    await repairSecurityHeaders(project, [{ kind: 'missingFile', file: 'nope' }]);

    expect(await read('next.config.ts')).toBe(NEXT_CONFIG);
  });
});

describe('repairValidationScripts', () => {
  it('rewrites deleted script files and rebuilds the scripts block', async () => {
    await seedPkg();

    await repairValidationScripts(project, [
      { kind: 'missingFile', file: 'scripts/sync-env.ts' },
      { kind: 'missingScript', name: 'env:sync', expected: 'tsx scripts/sync-env.ts' },
      { kind: 'missingScript', name: 'validate' },
      { kind: 'missingPackage', name: 'tsx', depKind: 'devDependency' },
    ]);

    expect(await exists('scripts/sync-env.ts')).toBe(true);
    // Not reported missing → not rewritten.
    expect(await exists('scripts/check-deprecated.ts')).toBe(false);

    const scripts = JSON.parse(await read('package.json')).scripts;
    expect(scripts['env:sync']).toBe('tsx scripts/sync-env.ts');
    // `validate` carries no expectedValue, so it comes from addValidationScripts.
    expect(scripts.validate).toContain('yarn type-check');
    expect(pm.installDevPackages).toHaveBeenCalledWith(project, 'yarn', ['tsx']);
  });

  it('never overwrites a script file the user still has', async () => {
    await seedPkg();
    await write('scripts/sync-env.ts', '// my edits');

    await repairValidationScripts(project, [{ kind: 'missingFile', file: 'scripts/sync-env.ts' }]);

    expect(await read('scripts/sync-env.ts')).toBe('// my edits');
  });
});

describe('repairCommitizen', () => {
  it('rewrites .czrc, restores the commit script and reinstalls the deps', async () => {
    await seedPkg();

    await repairCommitizen(project, [
      { kind: 'missingFile', file: '.czrc' },
      { kind: 'missingScript', name: 'commit', expected: 'cz' },
      { kind: 'missingPackage', name: 'commitizen', depKind: 'devDependency' },
    ]);

    expect(JSON.parse(await read('.czrc')).path).toBe('cz-conventional-changelog');
    expect(JSON.parse(await read('package.json')).scripts.commit).toBe('cz');
    expect(pm.installDevPackages).toHaveBeenCalledWith(project, 'yarn', ['commitizen']);
  });
});

describe('repairTests', () => {
  it('re-copies vitest.config.ts and regenerates test-utils from the starter', async () => {
    await seedPkg({ dependencies: { '@reduxjs/toolkit': '*', 'react-redux': '*' } });

    await repairTests(project, [
      { kind: 'missingFile', file: 'vitest.config.ts' },
      { kind: 'missingFile', file: 'test' },
      { kind: 'missingScript', name: 'test', expected: 'vitest run' },
      { kind: 'missingPackage', name: 'vitest', depKind: 'devDependency' },
    ]);

    expect(await exists('vitest.config.ts')).toBe(true);
    expect(await exists('test/setup.ts')).toBe(true);
    // test-utils is generated to match the project's features, not copied.
    expect(await read('test/test-utils.tsx')).toContain('react-redux');
    expect(JSON.parse(await read('package.json')).scripts.test).toBe('vitest run');
    expect(pm.installDevPackages).toHaveBeenCalledWith(project, 'yarn', ['vitest']);
  });

  it('does not hit the network when only packages drifted', async () => {
    await seedPkg();

    await repairTests(project, [
      { kind: 'missingPackage', name: 'jsdom', depKind: 'devDependency' },
    ]);

    expect(cloneCalls).toEqual([]);
  });

  it('never clobbers a test directory the user still has', async () => {
    await seedPkg();
    await write('test/setup.ts', '// my setup');

    await repairTests(project, [{ kind: 'missingFile', file: 'test' }]);

    expect(await read('test/setup.ts')).toBe('// my setup');
  });
});

// --- heavier features -------------------------------------------------------

const ROOT_PROVIDER_BARE = `'use client';
import type { ReactNode } from 'react';

export const RootProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <div>{children}</div>
  );
};
`;

describe('repairDarkTheme', () => {
  it('re-copies CustomThemeProvider and restores the wrap', async () => {
    await seedPkg();
    await write('src/providers/index.ts', "export * from './RootProvider';\n");
    await write('src/providers/RootProvider.tsx', ROOT_PROVIDER_BARE);

    await repairDarkTheme(project, [
      { kind: 'missingFile', file: 'src/providers/CustomThemeProvider.tsx' },
      {
        kind: 'missingInjection',
        file: 'src/providers/RootProvider.tsx',
        description: 'wrap',
      },
      { kind: 'missingPackage', name: '@teispace/next-themes', depKind: 'dependency' },
    ]);

    expect(await exists('src/providers/CustomThemeProvider.tsx')).toBe(true);
    expect(await read('src/providers/RootProvider.tsx')).toContain('<CustomThemeProvider>');
    expect(await read('src/providers/index.ts')).toContain('CustomThemeProvider');
    expect(pm.installPackages).toHaveBeenCalledWith(project, 'yarn', ['@teispace/next-themes']);
  });
});

describe('repairRedux', () => {
  it('restores StoreProvider and the RootProvider wrap', async () => {
    await seedPkg();
    await write('src/providers/RootProvider.tsx', ROOT_PROVIDER_BARE);

    await repairRedux(project, [
      { kind: 'missingFile', file: 'src/providers/StoreProvider.tsx' },
      {
        kind: 'missingInjection',
        file: 'src/providers/RootProvider.tsx',
        description: 'StoreProvider wrap',
      },
      { kind: 'missingPackage', name: 'react-redux', depKind: 'dependency' },
    ]);

    expect(await exists('src/providers/StoreProvider.tsx')).toBe(true);
    expect(await read('src/providers/RootProvider.tsx')).toContain('<StoreProvider');
    expect(pm.installPackages).toHaveBeenCalledWith(project, 'yarn', ['react-redux']);
  });

  it('never re-copies src/store over an existing store', async () => {
    await seedPkg();
    await write('src/store/rootReducer.ts', '// my reducers');

    await repairRedux(project, [{ kind: 'missingFile', file: 'src/store' }]);

    expect(await read('src/store/rootReducer.ts')).toBe('// my reducers');
    expect(cloneCalls).toEqual([]);
  });
});

const STORE_PROVIDER_WITHOUT_BRIDGE = `'use client';
import { useRef } from 'react';
import { Provider } from 'react-redux';
import { type AppStore, makeStore } from '@/store';

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  return <Provider store={storeRef.current}>{children}</Provider>;
};
`;

const ROOT_REDUCER_WITHOUT_WS = `import { combineReducers } from '@reduxjs/toolkit';

export const rootReducer = combineReducers({
  count: countReducer,
});
`;

describe('repairWs', () => {
  it('re-registers the reducer and re-mounts the bridge', async () => {
    await seedPkg();
    await write('src/store/rootReducer.ts', ROOT_REDUCER_WITHOUT_WS);
    await write('src/providers/StoreProvider.tsx', STORE_PROVIDER_WITHOUT_BRIDGE);

    await repairWs(project, [
      { kind: 'missingInjection', file: 'src/store/rootReducer.ts', description: 'wsReducer' },
      {
        kind: 'missingInjection',
        file: 'src/providers/StoreProvider.tsx',
        description: 'bridge mount',
      },
    ]);

    expect(await read('src/store/rootReducer.ts')).toMatch(/ws:\s*wsReducer\b/);
    expect(await read('src/providers/StoreProvider.tsx')).toContain(
      'attachWsBridge(wsClient, store.dispatch)',
    );
  });

  it('re-copies the ws slice and keeps socket.io-client pinned', async () => {
    await seedPkg();

    await repairWs(project, [
      { kind: 'missingFile', file: 'src/store/slices/ws.slice.ts' },
      { kind: 'missingPackage', name: 'socket.io-client', depKind: 'dependency' },
    ]);

    expect(await exists('src/store/slices/ws.slice.ts')).toBe(true);
    expect(pm.installPackage).toHaveBeenCalledWith(project, 'socket.io-client@^4.8.3');
  });

  it('strips starter test files from a restored ws tree when vitest is absent', async () => {
    await seedPkg();

    await repairWs(project, [{ kind: 'missingFile', file: 'src/lib/utils/ws' }]);

    expect(await exists('src/lib/utils/ws/index.ts')).toBe(true);
    expect(await exists('src/lib/utils/ws/client.test.ts')).toBe(false);
  });
});

describe('repairI18n', () => {
  it('restores src/i18n, proxy.ts, the plugin wrap and the dependency', async () => {
    await seedPkg();
    await write('next.config.ts', NEXT_CONFIG);
    await write('src/providers/RootProvider.tsx', ROOT_PROVIDER_BARE);

    await repairI18n(project, [
      { kind: 'missingFile', file: 'src/i18n' },
      { kind: 'missingFile', file: 'src/proxy.ts' },
      { kind: 'missingInjection', file: 'next.config.ts', description: 'plugin wrap' },
      { kind: 'missingPackage', name: 'next-intl', depKind: 'dependency' },
    ]);

    expect(await exists('src/i18n/request.ts')).toBe(true);
    expect(await exists('src/proxy.ts')).toBe(true);
    expect(await read('next.config.ts')).toContain('createNextIntlPlugin');
    expect(pm.installPackages).toHaveBeenCalledWith(project, 'yarn', ['next-intl']);
  });

  it('never recreates src/app/[locale] — that would move user pages', async () => {
    await seedPkg();
    await write('src/app/page.tsx', '// my page');

    await repairI18n(project, [{ kind: 'missingFile', file: 'src/app/[locale]' }]);

    expect(await exists('src/app/[locale]')).toBe(false);
    expect(await read('src/app/page.tsx')).toBe('// my page');
  });
});

const LAYOUT_WITHOUT_SENTINEL = `import { RootProvider } from '@/providers';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootProvider>
      {children}
    </RootProvider>
  );
}
`;

describe('repairHttpClient', () => {
  it('restores the shared plumbing and re-mounts the sentinel', async () => {
    await seedPkg();
    await write('src/lib/utils/http/index.ts', 'export {};');
    await write('src/lib/utils/http/fetch-client/index.ts', 'export const fetchClient = {};');
    await write('src/app/layout.tsx', LAYOUT_WITHOUT_SENTINEL);

    await repairHttpClient(project, [
      { kind: 'missingFile', file: 'src/lib/utils/http/shared' },
      { kind: 'missingFile', file: 'src/lib/utils/http/server.ts' },
      {
        kind: 'missingInjection',
        file: 'src/app/layout.tsx',
        description: 'sentinel mount',
      },
    ]);

    expect(await exists('src/lib/utils/http/shared/index.ts')).toBe(true);
    expect(await exists('src/lib/utils/http/server.ts')).toBe(true);
    expect(await read('src/app/layout.tsx')).toContain('<HttpClientBundleSentinel />');
  });

  it('never prompts or re-copies the client variants', async () => {
    await seedPkg();
    await write('src/lib/utils/http/axios-client/index.ts', 'export const axiosClient = {};');
    await write('src/app/layout.tsx', LAYOUT_WITHOUT_SENTINEL);

    await repairHttpClient(project, [
      {
        kind: 'missingInjection',
        file: 'src/app/layout.tsx',
        description: 'sentinel mount',
      },
    ]);

    expect(await exists('src/lib/utils/http/fetch-client/index.ts')).toBe(false);
    expect(cloneCalls).toEqual([]);
  });
});

describe('repairs are idempotent', () => {
  it('running the same repair twice changes nothing the second time', async () => {
    await seedPkg();
    await write('next.config.ts', NEXT_CONFIG);
    const drift: FeatureFinding[] = [
      { kind: 'missingInjection', file: 'next.config.ts', description: 'wrap' },
      { kind: 'missingScript', name: 'analyze', expected: 'ANALYZE=true next build' },
    ];

    await repairBundleAnalyzer(project, drift);
    const afterFirst = await read('next.config.ts');
    await repairBundleAnalyzer(project, drift);

    expect(await read('next.config.ts')).toBe(afterFirst);
  });
});
