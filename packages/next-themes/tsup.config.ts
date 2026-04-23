import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    server: 'src/server.ts',
    adapters: 'src/adapters.ts',
    script: 'src/script.ts',
    tailwind: 'src/tailwind.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  external: ['react', 'react-dom', 'next', 'next/navigation', 'next/headers'],
  target: 'es2020',
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
