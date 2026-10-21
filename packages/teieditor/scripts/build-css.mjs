// Bundles src/styles/index.css into dist/styles.css, imports inlined and
// minified. The floor is the first release of each browser with both
// light-dark() and the Popover API (spring 2024).
import { build } from 'esbuild';

await build({
  entryPoints: { styles: 'src/styles/index.css' },
  outdir: 'dist',
  bundle: true,
  minify: true,
  target: ['chrome123', 'edge123', 'firefox125', 'safari17.5'],
  logLevel: 'warning',
});
