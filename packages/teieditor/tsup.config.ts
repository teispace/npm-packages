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
  sourcemap: false,
  target: 'es2022',
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
    // Minified, but not its whitespace: that pass also strips the
    // `@__PURE__` and `@__NO_SIDE_EFFECTS__` notes an app's bundler needs to
    // drop unused icons and components. The app's own minifier does the rest.
    options.minifySyntax = true;
    options.minifyIdentifiers = true;
  },
});
