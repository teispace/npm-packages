import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureTestSetupMocks,
  injectBridgeMount,
  installBridgeMount,
  registerWsReducer,
  removeBridgeMount,
  stripBridgeMount,
  stripWsReducerRegistration,
} from '../../../../src/services/setup/ws/injectors';

// Redux-only StoreProvider (what the template ships when ws is opted out).
// useEffect is NOT in the React import — injectBridgeMount has to add it.
const REDUX_ONLY_STORE_PROVIDER = `'use client';
import { useRef } from 'react';

import { Provider } from 'react-redux';
import type { Persistor } from 'redux-persist';
import { PersistGate } from 'redux-persist/integration/react';

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

  return (
    <Provider store={storeRef.current}>
      <PersistGate persistor={persistorRef.current as Persistor} loading={children}>
        {children}
      </PersistGate>
    </Provider>
  );
};
`;

describe('injectBridgeMount (pure)', () => {
  it('adds the import and useEffect block in a redux-only StoreProvider', () => {
    const result = injectBridgeMount(REDUX_ONLY_STORE_PROVIDER);

    expect(result).toContain("import { attachWsBridge, wsClient } from '@/lib/utils/ws';");
    expect(result).toContain('attachWsBridge(wsClient, store.dispatch)');
    // useEffect must be in the React import now (it was missing in the input).
    expect(result).toMatch(/import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*['"]react['"]/);
    // Effect appears AFTER the storeRef initialiser but BEFORE the return.
    // Anchor on the function-call form so the import line doesn't match.
    const initIdx = result.indexOf('storeRef.current = makeStore');
    const effectIdx = result.indexOf('attachWsBridge(wsClient, store.dispatch)');
    const returnIdx = result.indexOf('return (');
    expect(initIdx).toBeLessThan(effectIdx);
    expect(effectIdx).toBeLessThan(returnIdx);
  });

  it('is idempotent — re-applying is a no-op', () => {
    const once = injectBridgeMount(REDUX_ONLY_STORE_PROVIDER);
    const twice = injectBridgeMount(once);
    expect(twice).toBe(once);
    expect(twice.match(/attachWsBridge\(wsClient, store\.dispatch\)/g)).toHaveLength(1);
  });

  it('throws when no `if (!storeRef.current)` initializer is present', () => {
    const bad = `import { useRef } from 'react';\nexport const X = () => null;\n`;
    expect(() => injectBridgeMount(bad)).toThrow(/storeRef\.current/);
  });
});

describe('stripBridgeMount (pure)', () => {
  it('round-trips back to the original after inject + strip', () => {
    const round = stripBridgeMount(injectBridgeMount(REDUX_ONLY_STORE_PROVIDER));
    expect(round).not.toContain('attachWsBridge');
    expect(round).not.toContain("from '@/lib/utils/ws'");
  });

  it('is idempotent on clean input', () => {
    const stripped = stripBridgeMount(REDUX_ONLY_STORE_PROVIDER);
    expect(stripped).toBe(REDUX_ONLY_STORE_PROVIDER);
  });

  it('drops `useEffect` from the React import when no other effects remain', () => {
    // Real-world case: the template ships StoreProvider with `import { useEffect, useRef }`
    // and a single `useEffect(...)` block calling attachWsBridge. After strip,
    // `useEffect` is unused — leaving it triggers a lint warning. We prune it.
    const withBridge = `'use client';
import { useEffect, useRef } from 'react';

import { attachWsBridge, wsClient } from '@/lib/utils/ws';

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const storeRef = useRef(null);

  if (!storeRef.current) {
    storeRef.current = {};
  }

  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    return attachWsBridge(wsClient, store.dispatch);
  }, []);

  return <div>{children}</div>;
};
`;
    const stripped = stripBridgeMount(withBridge);
    expect(stripped).toContain("import { useRef } from 'react'");
    expect(stripped).not.toContain('useEffect');
  });

  it('keeps `useEffect` in the React import when other effects survive', () => {
    // Edge case: a user added an unrelated useEffect. We must not break it
    // by pruning useEffect from the import.
    const withTwoEffects = `'use client';
import { useEffect, useRef } from 'react';

import { attachWsBridge, wsClient } from '@/lib/utils/ws';

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const storeRef = useRef(null);

  if (!storeRef.current) {
    storeRef.current = {};
  }

  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    return attachWsBridge(wsClient, store.dispatch);
  }, []);

  useEffect(() => {
    console.log('user effect');
  }, []);

  return <div>{children}</div>;
};
`;
    const stripped = stripBridgeMount(withTwoEffects);
    // The bridge effect goes; the user effect survives.
    expect(stripped).not.toContain('attachWsBridge');
    expect(stripped).toContain("console.log('user effect')");
    // useEffect import must stay.
    expect(stripped).toMatch(/import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*['"]react['"]/);
  });
});

describe('installBridgeMount / removeBridgeMount (filesystem)', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-bridge-fs-'));
    await mkdir(path.join(project, 'src/providers'), { recursive: true });
    await writeFile(
      path.join(project, 'src/providers/StoreProvider.tsx'),
      REDUX_ONLY_STORE_PROVIDER,
    );
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('installs the bridge mount into StoreProvider', async () => {
    await installBridgeMount(project);

    const result = await readFile(path.join(project, 'src/providers/StoreProvider.tsx'), 'utf-8');
    expect(result).toContain('attachWsBridge(wsClient, store.dispatch)');
  });

  it('remove strips it back out', async () => {
    await installBridgeMount(project);
    await removeBridgeMount(project);

    const result = await readFile(path.join(project, 'src/providers/StoreProvider.tsx'), 'utf-8');
    expect(result).not.toContain('attachWsBridge');
  });

  it('is a no-op when StoreProvider.tsx does not exist', async () => {
    await rm(path.join(project, 'src/providers/StoreProvider.tsx'));
    await expect(installBridgeMount(project)).resolves.toBeUndefined();
    await expect(removeBridgeMount(project)).resolves.toBeUndefined();
  });
});

describe('registerWsReducer', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-reducer-'));
    await mkdir(path.join(project, 'src/store'), { recursive: true });
    await writeFile(
      path.join(project, 'src/store/rootReducer.ts'),
      `import { combineReducers } from '@reduxjs/toolkit';\nimport { persistReducer } from 'redux-persist';\n\nimport { countPersistConfig, counterReducer as countReducer } from '@/features/counter/store';\n\nexport const rootReducer = combineReducers({\n  count: persistReducer(countPersistConfig, countReducer),\n});\n`,
    );
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('registers wsReducer without wrapping it in persistReducer', async () => {
    await registerWsReducer(project);

    const result = await readFile(path.join(project, 'src/store/rootReducer.ts'), 'utf-8');
    expect(result).toContain("import { wsReducer } from '@/store/slices/ws.slice';");
    // Bare reducer reference — connection state is ephemeral, must not persist.
    expect(result).toMatch(/ws:\s*wsReducer\b/);
    expect(result).not.toMatch(/ws:\s*persistReducer\(/);
  });
});

describe('ensureTestSetupMocks', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-test-setup-'));
    await mkdir(path.join(project, 'test'), { recursive: true });
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('appends both mocks to a bare test/setup.ts', async () => {
    await writeFile(
      path.join(project, 'test/setup.ts'),
      `import '@testing-library/jest-dom/vitest';\nimport { cleanup } from '@testing-library/react';\nimport { afterEach, vi } from 'vitest';\n\nafterEach(() => cleanup());\n`,
    );

    await ensureTestSetupMocks(project);

    const result = await readFile(path.join(project, 'test/setup.ts'), 'utf-8');
    expect(result).toContain("vi.mock('react-secure-storage'");
    expect(result).toContain("vi.mock('server-only'");
  });

  it('is idempotent — re-running does not duplicate mocks', async () => {
    await writeFile(
      path.join(project, 'test/setup.ts'),
      `import { vi } from 'vitest';\nvi.mock('react-secure-storage', () => ({}));\nvi.mock('server-only', () => ({}));\n`,
    );

    const before = await readFile(path.join(project, 'test/setup.ts'), 'utf-8');
    await ensureTestSetupMocks(project);
    const after = await readFile(path.join(project, 'test/setup.ts'), 'utf-8');
    expect(after).toBe(before);
  });

  it('is a no-op when test/setup.ts does not exist', async () => {
    // No vitest in the project — nothing to do.
    await expect(ensureTestSetupMocks(project)).resolves.toBeUndefined();
  });
});

// Mirrors the actual template's import path (`./slices/ws.slice`, relative).
// The setup-flow registerInRootReducer writes the alias form
// (`@/store/slices/ws.slice`); both must strip.
const TEMPLATE_ROOT_REDUCER = `import { combineReducers } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';

import { countPersistConfig, counterReducer as countReducer } from '@/features/counter/store';

import { wsReducer } from './slices/ws.slice';

/**
 * \`ws\` is intentionally NOT wrapped in \`persistReducer\` — connection state
 * is ephemeral, and rehydrating "connected: true" on first paint would lie
 * about the actual transport.
 */
export const rootReducer = combineReducers({
  count: persistReducer(countPersistConfig, countReducer),
  ws: wsReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
`;

describe('stripWsReducerRegistration (pure)', () => {
  it('removes the import, the ws entry, and the JSDoc comment block', () => {
    const result = stripWsReducerRegistration(TEMPLATE_ROOT_REDUCER);
    expect(result).not.toContain('wsReducer');
    expect(result).not.toContain('ws.slice');
    expect(result).not.toContain('intentionally NOT wrapped');
    // The rest survives untouched.
    expect(result).toContain('combineReducers({');
    expect(result).toContain('count: persistReducer(countPersistConfig, countReducer)');
  });

  it('also strips the alias-form import (`@/store/slices/ws.slice`)', () => {
    // The setup --redux flow writes the alias form via the existing
    // root-reducer modifier — the strip must handle that variant too.
    const withAliasPath = TEMPLATE_ROOT_REDUCER.replace(
      "from './slices/ws.slice'",
      "from '@/store/slices/ws.slice'",
    );
    const result = stripWsReducerRegistration(withAliasPath);
    expect(result).not.toContain('wsReducer');
    expect(result).not.toContain('@/store/slices/ws.slice');
  });

  it('is idempotent on clean input (no ws entries already present)', () => {
    const stripped = stripWsReducerRegistration(TEMPLATE_ROOT_REDUCER);
    const twice = stripWsReducerRegistration(stripped);
    expect(twice).toBe(stripped);
  });

  it('tolerates wording drift in the JSDoc as long as `ws` and `persistReducer` co-appear', () => {
    const reworded = TEMPLATE_ROOT_REDUCER.replace(
      /\/\*\*[\s\S]*?\*\//,
      `/**\n * \`ws\` here is unwrapped on purpose — no persistReducer call.\n */`,
    );
    const result = stripWsReducerRegistration(reworded);
    expect(result).not.toContain('unwrapped on purpose');
    expect(result).not.toContain('wsReducer');
  });
});
