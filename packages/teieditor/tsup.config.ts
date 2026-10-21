import { defineConfig } from 'tsup';

/**
 * One output module per source file, in the source layout (which is also
 * where `tsc -p tsconfig.build.json` writes the declarations).
 *
 * Unbundled on purpose. With `"sideEffects"` limited to CSS, an app's
 * bundler drops every module it does not use: importing `useTeiEditor`
 * does not pull in the menus or `@floating-ui/dom`. A bundled entry is one
 * module, and its top-level `forwardRef`/`memo` calls look like side
 * effects, so nothing in it could be dropped.
 *
 * It also keeps each file's `'use client'` directive (esbuild drops
 * directives only when it bundles), so exactly the client files carry it.
 */
export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.test.*'],
  bundle: false,
  format: ['esm'],
  // Declarations come from `tsc -p tsconfig.build.json` (see there).
  dts: false,
  clean: true,
  minify: true,
  sourcemap: false,
  target: 'es2022',
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
