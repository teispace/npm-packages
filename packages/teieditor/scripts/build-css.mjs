// Bundles the stylesheets, imports inlined and minified: dist/styles.css
// (everything) from src/styles/index.css, and dist/styles/<name>.css for
// core.css and each feature's own file. The floor is the first release of
// each browser with both light-dark() and the Popover API (spring 2024).
import { readdirSync } from 'node:fs';
import { build } from 'esbuild';

const options = {
  bundle: true,
  minify: true,
  target: ['chrome123', 'edge123', 'firefox125', 'safari17.5'],
  logLevel: 'warning',
};

/** The pieces core.css is made of, which aren't entries of their own. */
const PARTS = new Set(['index.css', 'tokens.css', 'base.css', 'content.css', 'ui.css']);

await build({ ...options, entryPoints: { styles: 'src/styles/index.css' }, outdir: 'dist' });
await build({
  ...options,
  entryPoints: readdirSync('src/styles')
    .filter((name) => name.endsWith('.css') && !PARTS.has(name))
    .map((name) => `src/styles/${name}`),
  outdir: 'dist/styles',
});
