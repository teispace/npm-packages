import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectPrompts } from '../../../../src/prompts/create-app.prompt';

// Stub the package-manager calls so tests don't actually spawn yarn/npm.
// The cleanup's only external side effect is the uninstall call.
const uninstallPackageSpy = vi.fn(async () => undefined);
vi.mock('../../../../src/core/package-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/core/package-manager')>();
  return {
    ...actual,
    uninstallPackage: uninstallPackageSpy,
  };
});

// Import AFTER the mock is registered.
const { cleanupWs } = await import('../../../../src/services/init/cleanup/ws.cleanup');

const baseAnswers = (overrides: Partial<ProjectPrompts> = {}): ProjectPrompts =>
  ({
    projectName: 'test',
    description: '',
    author: '',
    version: '0.0.0',
    packageManager: 'yarn',
    gitRemote: '',
    pushToRemote: false,
    gitIssues: '',
    gitHomepage: '',
    httpClient: 'fetch',
    email: '',
    company: '',
    keepTemplates: false,
    darkMode: false,
    redux: true,
    ws: false,
    i18n: false,
    communityFiles: [],
    readme: false,
    docker: false,
    ci: false,
    preCommitHooks: false,
    commitizen: false,
    copyEnv: false,
    tests: false,
    reactCompiler: false,
    bundleAnalyzer: false,
    ...overrides,
  }) as ProjectPrompts;

const TEMPLATE_ROOT_REDUCER = `import { combineReducers } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';

import { countPersistConfig, counterReducer as countReducer } from '@/features/counter/store';

import { wsReducer } from '@/store/slices/ws.slice';

/**
 * \`ws\` is intentionally NOT wrapped in \`persistReducer\` — connection state
 * is ephemeral, and rehydrating "connected: true" on first paint would lie
 * about the actual transport. The bridge dispatches the real status as
 * soon as the WS client mounts.
 */
export const rootReducer = combineReducers({
  count: persistReducer(countPersistConfig, countReducer),
  ws: wsReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
`;

const TEMPLATE_STORE_PROVIDER = `'use client';
import { useEffect, useRef } from 'react';

import { Provider } from 'react-redux';
import type { Persistor } from 'redux-persist';
import { PersistGate } from 'redux-persist/integration/react';

import { attachWsBridge, wsClient } from '@/lib/utils/ws';
import { type AppState, type AppStore, makeStore } from '@/store';
import { createPersistor } from '@/store/persistor';

type StoreProviderProps = {
  children: React.ReactNode;
  preloadedState?: Partial<AppState>;
};

export const StoreProvider = ({ children, preloadedState }: StoreProviderProps) => {
  const storeRef = useRef<AppStore | null>(null);
  const persistorRef = useRef<Persistor | null>(null);

  if (!storeRef.current) {
    storeRef.current = makeStore(preloadedState);
    persistorRef.current = createPersistor(storeRef.current);
  }

  // Bridge the WS client's lifecycle into the Redux slice exactly once per
  // store instance. The bridge does not open a connection — that happens
  // lazily on first \`useWsEvent\` subscription or an explicit \`connect()\`.
  // Effect runs in the browser only, so the SSR boundary is safe.
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    return attachWsBridge(wsClient, store.dispatch);
  }, []);

  return (
    <Provider store={storeRef.current}>
      <PersistGate persistor={persistorRef.current as Persistor} loading={children}>
        {children}
      </PersistGate>
    </Provider>
  );
};
`;

async function seedTemplateProject(root: string): Promise<void> {
  // ws/ subtree
  await mkdir(path.join(root, 'src/lib/utils/ws/client'), { recursive: true });
  await writeFile(path.join(root, 'src/lib/utils/ws/index.ts'), '// stub barrel\n');
  await writeFile(path.join(root, 'src/lib/utils/ws/client/ws-client.ts'), '// stub\n');

  // slice
  await mkdir(path.join(root, 'src/store/slices'), { recursive: true });
  await writeFile(
    path.join(root, 'src/store/slices/ws.slice.ts'),
    'export const wsReducer = () => ({}) as any;\n',
  );

  // rootReducer + StoreProvider (template shape with ws wired in)
  await writeFile(path.join(root, 'src/store/rootReducer.ts'), TEMPLATE_ROOT_REDUCER);
  await mkdir(path.join(root, 'src/providers'), { recursive: true });
  await writeFile(path.join(root, 'src/providers/StoreProvider.tsx'), TEMPLATE_STORE_PROVIDER);

  // package.json with socket.io-client
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'test',
        version: '0.0.0',
        dependencies: {
          'socket.io-client': '^4.8.3',
          '@reduxjs/toolkit': '^2.0.0',
        },
      },
      null,
      2,
    ),
  );
}

describe('cleanupWs', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-cleanup-'));
    await seedTemplateProject(project);
    uninstallPackageSpy.mockClear();
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('is a no-op when answers.ws is true', async () => {
    await cleanupWs(project, baseAnswers({ ws: true }));

    expect(existsSync(path.join(project, 'src/lib/utils/ws'))).toBe(true);
    expect(existsSync(path.join(project, 'src/store/slices/ws.slice.ts'))).toBe(true);
    expect(uninstallPackageSpy).not.toHaveBeenCalled();
  });

  it('deletes the ws subtree and slice when ws is off', async () => {
    await cleanupWs(project, baseAnswers({ ws: false, redux: true }));

    expect(existsSync(path.join(project, 'src/lib/utils/ws'))).toBe(false);
    expect(existsSync(path.join(project, 'src/store/slices/ws.slice.ts'))).toBe(false);
  });

  it('strips wsReducer registration from rootReducer.ts', async () => {
    await cleanupWs(project, baseAnswers({ ws: false, redux: true }));

    const rootReducer = await readFile(path.join(project, 'src/store/rootReducer.ts'), 'utf-8');
    expect(rootReducer).not.toContain('wsReducer');
    expect(rootReducer).not.toContain('@/store/slices/ws.slice');
    // The unwrapped-on-purpose comment block must go too — it's misleading
    // without the ws entry it explained.
    expect(rootReducer).not.toContain('intentionally NOT wrapped');
    // The rest of the file survives intact.
    expect(rootReducer).toContain('combineReducers({');
    expect(rootReducer).toContain('count: persistReducer(countPersistConfig, countReducer)');
  });

  it('strips the attachWsBridge mount from StoreProvider', async () => {
    await cleanupWs(project, baseAnswers({ ws: false, redux: true }));

    const storeProvider = await readFile(
      path.join(project, 'src/providers/StoreProvider.tsx'),
      'utf-8',
    );
    expect(storeProvider).not.toContain('attachWsBridge');
    expect(storeProvider).not.toContain('@/lib/utils/ws');
    // Everything else still there.
    expect(storeProvider).toContain('makeStore');
    expect(storeProvider).toContain('PersistGate');
  });

  it('uninstalls socket.io-client', async () => {
    await cleanupWs(project, baseAnswers({ ws: false, redux: true }));
    expect(uninstallPackageSpy).toHaveBeenCalledTimes(1);
    expect(uninstallPackageSpy).toHaveBeenCalledWith(project, 'socket.io-client');
  });

  it('skips the in-store edits when redux is also off (store is about to go away)', async () => {
    // Pre-condition: cleanupRedux runs AFTER cleanupWs and deletes src/store/
    // wholesale. Reading rootReducer.ts here would be wasted work.
    await cleanupWs(project, baseAnswers({ ws: false, redux: false }));

    // The ws subtree + slice still get deleted regardless.
    expect(existsSync(path.join(project, 'src/lib/utils/ws'))).toBe(false);
    expect(existsSync(path.join(project, 'src/store/slices/ws.slice.ts'))).toBe(false);

    // But rootReducer is untouched — cleanupRedux will rm-rf the whole store.
    const rootReducer = await readFile(path.join(project, 'src/store/rootReducer.ts'), 'utf-8');
    expect(rootReducer).toContain('wsReducer');

    // socket.io-client still uninstalls — it's an app-level dep, not store-scoped.
    expect(uninstallPackageSpy).toHaveBeenCalledWith(project, 'socket.io-client');
  });

  it('does not uninstall socket.io-client when the dep is absent', async () => {
    // Edge case: a user who manually removed socket.io-client before init
    // somehow. Cleanup should detect and skip the slow yarn/npm invocation.
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ name: 'test', version: '0.0.0', dependencies: {} }, null, 2),
    );
    await cleanupWs(project, baseAnswers({ ws: false, redux: true }));
    expect(uninstallPackageSpy).not.toHaveBeenCalled();
  });
});
