import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { registerInRootReducer } from '../../../modifiers/root-reducer.modifier';

const BRIDGE_IMPORT_LINE = "import { attachWsBridge, wsClient } from '@/lib/utils/ws';";
const BRIDGE_EFFECT_BLOCK = `
  // Bridge the WS client's lifecycle into the Redux slice exactly once per
  // store instance. The bridge does not open a connection — that happens
  // lazily on first \`useWsEvent\` subscription or an explicit \`connect()\`.
  // Effect runs in the browser only, so the SSR boundary is safe.
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    return attachWsBridge(wsClient, store.dispatch);
  }, []);
`;

/**
 * Register `wsReducer` in `src/store/rootReducer.ts` WITHOUT wrapping it in
 * `persistReducer` — connection state is ephemeral and rehydrating it would
 * lie about the actual transport. Delegates to the existing root-reducer
 * modifier; passing `persist: false` produces the same shape the template ships.
 */
export const registerWsReducer = async (projectPath: string): Promise<void> => {
  await registerInRootReducer({
    projectPath,
    name: 'ws',
    persist: false,
    importPath: 'src/store/slices/ws.slice',
  });
};

/**
 * Pure helper: insert the `attachWsBridge` import + useEffect block into a
 * StoreProvider.tsx source string. Idempotent — bails when the import is
 * already present.
 *
 * The bridge effect mounts immediately after the `if (!storeRef.current) {...}`
 * initialiser, matching the template. We anchor on the closing brace of that
 * block to preserve any pre-existing effects further down (a user may have
 * added unrelated mount logic).
 */
export const injectBridgeMount = (content: string): string => {
  if (content.includes("from '@/lib/utils/ws'")) return content;

  let next = content;

  // 1. Add the import after the last `import` line.
  const importBlockRe = /(^import\s[^\n]*\n)+/m;
  const importBlock = next.match(importBlockRe);
  if (!importBlock) {
    throw new Error(
      'injectBridgeMount: no `import` lines found — expected a StoreProvider with imports.',
    );
  }
  const importEnd = (importBlock.index ?? 0) + importBlock[0].length;
  next = `${next.slice(0, importEnd)}${BRIDGE_IMPORT_LINE}\n${next.slice(importEnd)}`;

  // 2. `useEffect` must be in the React import. Add it if missing.
  next = ensureUseEffectImport(next);

  // 3. Insert the effect block after `if (!storeRef.current) { ... }`.
  const initializerRe = /(if\s*\(\s*!storeRef\.current\s*\)\s*\{[\s\S]*?\n\s*\})/;
  const match = next.match(initializerRe);
  if (!match) {
    throw new Error(
      'injectBridgeMount: could not locate `if (!storeRef.current) { ... }` initializer — StoreProvider shape unexpected.',
    );
  }
  next = next.replace(initializerRe, `$1\n${BRIDGE_EFFECT_BLOCK.trimEnd()}\n`);

  return next;
};

/**
 * Reverse of `injectBridgeMount`. Drops the import + effect block. Leaves
 * `useEffect` in the React import alone — the user may have other effects.
 */
export const stripBridgeMount = (content: string): string => {
  let next = content;

  // Drop the import line (with or without trailing newline).
  next = next.replace(new RegExp(`${escapeRe(BRIDGE_IMPORT_LINE)}\\n?`), '');

  // Drop the comment + effect block. The block is anchored on the comment
  // (which is distinctive) plus the matching closing of the effect.
  next = next.replace(
    /\n\s*\/\/ Bridge the WS client's lifecycle[\s\S]*?attachWsBridge\(wsClient, store\.dispatch\);\s*\n\s*\},\s*\[\]\);\n?/,
    '\n',
  );

  return next;
};

/**
 * Filesystem-bound install/strip pair.
 */
export const installBridgeMount = async (projectPath: string): Promise<void> => {
  const target = path.join(projectPath, PROJECT_PATHS.STORE_PROVIDER);
  if (!fileExists(target)) return;
  const before = await readFile(target);
  const after = injectBridgeMount(before);
  if (after !== before) await writeFile(target, after);
};

export const removeBridgeMount = async (projectPath: string): Promise<void> => {
  const target = path.join(projectPath, PROJECT_PATHS.STORE_PROVIDER);
  if (!fileExists(target)) return;
  const before = await readFile(target);
  const after = stripBridgeMount(before);
  if (after !== before) await writeFile(target, after);
};

/**
 * Append `react-secure-storage` and `server-only` mocks to `test/setup.ts`
 * if either is missing. The template ships them by default; this helper
 * covers the case where the user has customised setup.ts after init.
 *
 * No-op when `test/setup.ts` doesn't exist (vitest isn't installed).
 */
export const ensureTestSetupMocks = async (projectPath: string): Promise<void> => {
  const target = path.join(projectPath, PROJECT_PATHS.TEST_SETUP_FILE);
  if (!fileExists(target)) return;

  let content = await readFile(target);
  let modified = false;

  if (!content.includes("vi.mock('react-secure-storage'")) {
    content += SECURE_STORAGE_MOCK;
    modified = true;
  }

  if (!content.includes("vi.mock('server-only'")) {
    content += SERVER_ONLY_MOCK;
    modified = true;
  }

  if (modified) {
    await writeFile(target, content);
  }
};

const SECURE_STORAGE_MOCK = `
// \`react-secure-storage\` constructs an \`EncryptionService\` at module load
// that fingerprints the browser via \`<canvas>.getContext\`. jsdom doesn't
// implement canvas, so the import explodes anywhere it's pulled in
// transitively (HTTP token store, WS auth carrier, etc.). Stub it globally —
// tests that need real behaviour are integration tests, not unit tests.
vi.mock('react-secure-storage', () => {
  const store = new Map<string, unknown>();
  return {
    default: {
      setItem: (k: string, v: unknown) => store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    },
  };
});
`;

const SERVER_ONLY_MOCK = `
// \`server-only\` throws at module load outside a Next.js server bundle —
// the package relies on bundler-level redirect to a no-op file in server
// environments. Vitest doesn't do that redirect, so we stub it as a no-op
// to let unit tests reach the server-side modules. Production builds are
// unaffected; Next.js still routes \`server-only\` to its real implementation.
vi.mock('server-only', () => ({}));
`;

/**
 * Ensures `useEffect` is in the React import line at the top of the file.
 * The template's StoreProvider has `import { useEffect, useRef } from 'react';`,
 * but a redux-only no-ws variant may have `import { useRef } from 'react';`.
 */
const ensureUseEffectImport = (content: string): string => {
  const reactImportRe = /import\s*\{([^}]*)\}\s*from\s*['"]react['"];/;
  const match = content.match(reactImportRe);
  if (!match) {
    // No React named import — could be `import * as React`. Leave it; the
    // user is on their own with non-standard import shape, and the build
    // will tell them they need useEffect.
    return content;
  }
  const inner = match[1];
  if (/\buseEffect\b/.test(inner)) return content;

  const names = inner
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  names.push('useEffect');
  names.sort();
  const rebuilt = `import { ${names.join(', ')} } from 'react';`;
  return content.replace(reactImportRe, rebuilt);
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
