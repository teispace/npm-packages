import * as esbuild from 'esbuild';
import { chmodSync } from 'fs';

try {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: {
      js: '#!/usr/bin/env node',
    },
    outfile: 'dist/index.js',
    external: ['enquirer', 'commander', 'picocolors', 'ora', 'degit'],
    minify: true, // Minify the output
    treeShaking: true, // Remove unused code
    target: 'node20', // Target Node.js 20+
    sourcemap: true, // Generate source maps for debugging
  });

  // Make the output file executable
  chmodSync('dist/index.js', 0o755);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
