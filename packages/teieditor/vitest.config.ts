import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Self-references inside the package (e.g. `@teispace/teieditor/extensions/
 * starter-kit` from `src/registry/editors/editor.tsx`) resolve to `dist/` at
 * runtime via the package.json `exports` map. In CI we run tests without
 * building first, so point every self-ref back at the source tree instead.
 *
 * Keep the exact-match entries first so the regex fallback doesn't catch
 * paths that should hit the barrel index (e.g. `/core` instead of `/core/*`).
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@teispace\/teieditor$/, replacement: resolve(__dirname, 'src/index.ts') },
      {
        find: /^@teispace\/teieditor\/(.+)$/,
        replacement: resolve(__dirname, 'src/$1/index'),
      },
    ],
  },
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['__tests__/setup.ts'],
  },
});
