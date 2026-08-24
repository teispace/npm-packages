import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core.ts',
    render: 'src/render.ts',
    validate: 'src/validate.ts',
    payload: 'src/payload.ts',
    export: 'src/export.ts',
    raster: 'src/raster.ts',
    verify: 'src/verify.ts',
    terminal: 'src/terminal.ts',
    kanji: 'src/kanji.ts',
  },
  // Dual ESM + CJS. ESM is the primary target, but CJS is still what a great
  // many Node tools resolve to, and an import-only exports map fails them with
  // ERR_PACKAGE_PATH_NOT_EXPORTED.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  // Minify the published JS: smaller install, and the npm "Code" tab shows
  // compact output. `.d.ts` are NOT minified — consumers need readable types
  // and IntelliSense, and the public API stays fully documented there.
  minify: true,
  // No published sourcemaps: they would reconstruct the original source and
  // defeat the point of minifying, and they bloat the package. The full,
  // readable source is on GitHub.
  sourcemap: false,
  target: 'es2022',
  outDir: 'dist',
  // Zero runtime dependencies. `node:*` builtins are external by default.
});
