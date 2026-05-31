import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    load: 'src/load.ts',
    config: 'src/config.ts',
    'presets/next': 'src/presets/next.ts',
    'presets/vite': 'src/presets/vite.ts',
    'presets/nuxt': 'src/presets/nuxt.ts',
    'presets/astro': 'src/presets/astro.ts',
    'presets/sveltekit': 'src/presets/sveltekit.ts',
    'presets/node': 'src/presets/node.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  // Minify the published JS: smaller install and the npm "Code" tab shows
  // compact output. The full, readable source lives on GitHub (open source).
  // `.d.ts` are NOT minified — consumers need readable types/IntelliSense, and
  // the public API stays fully documented there.
  minify: true,
  // No published sourcemaps — they would reconstruct the original source and
  // defeat the point of minifying, and they bloat the package.
  sourcemap: false,
  // Zero runtime deps; nothing to externalize. `node:*` builtins are external by default.
  target: 'es2022',
  outDir: 'dist',
});
