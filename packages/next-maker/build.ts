import * as esbuild from 'esbuild';
import { chmodSync, rmSync } from 'fs';

try {
  // Clean stale artifacts first. esbuild does not clear its outdir, so a
  // prior build's `index.js.map` (from when sourcemaps were enabled) would
  // otherwise linger and get published. The subsequent `tsc
  // --emitDeclarationOnly` step (in the npm `build` script) repopulates the
  // declarations after this.
  rmSync('dist', { recursive: true, force: true });

  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: {
      js: '#!/usr/bin/env node',
    },
    outfile: 'dist/index.js',
    external: ['enquirer', 'commander', 'picocolors', 'ora', 'degit', 'sharp', 'png-to-ico'],
    minify: true, // Minify the output
    treeShaking: true, // Remove unused code
    target: 'node20', // Target Node.js 20+
    sourcemap: false, // No source maps in the published bundle
  });

  // Make the output file executable
  chmodSync('dist/index.js', 0o755);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
