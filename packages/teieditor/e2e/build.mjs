// Bundles the e2e harness (e2e/harness) into e2e/.out: the page, its script,
// and the package's own stylesheet, built from source as consumers get it.
import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const out = new URL('./.out/', import.meta.url);
const harness = new URL('./harness/', import.meta.url);
await mkdir(out, { recursive: true });

await Promise.all([
  build({
    entryPoints: {
      main: new URL('main.tsx', harness).pathname,
      bare: new URL('bare.ts', harness).pathname,
    },
    outdir: out.pathname,
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    sourcemap: true,
    target: ['chrome123', 'edge123', 'firefox125', 'safari17.5'],
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
    logLevel: 'warning',
  }),
  build({
    entryPoints: { styles: new URL('../src/styles/index.css', import.meta.url).pathname },
    outdir: out.pathname,
    bundle: true,
    target: ['chrome123', 'edge123', 'firefox125', 'safari17.5'],
    logLevel: 'warning',
  }),
  copyFile(new URL('index.html', harness), new URL('index.html', out)),
  copyFile(new URL('bare.html', harness), new URL('bare.html', out)),
  copyFile(new URL('harness.css', harness), new URL('harness.css', out)),
  // An image from the page's own origin, which the CSP allows.
  copyFile(new URL('photo.svg', harness), new URL('photo.svg', out)),
  copyFile(new URL('report.pdf', harness), new URL('report.pdf', out)),
]);
