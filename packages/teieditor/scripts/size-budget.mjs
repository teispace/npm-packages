/**
 * What an app ships for each way of using the package: the built entries
 * bundled the way an app's bundler would (minified, tree-shaken, gzipped),
 * with the peers (Lexical, React) left out, since the app has those anyway.
 * Fails when a budgeted case goes over.
 *
 *   yarn size          (after `yarn build`)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (path) => resolve(root, 'dist', path);
const KB = 1024;

/** Each case is the code an app would write; `budget` in gzipped bytes. */
const CASES = [
  {
    name: 'core (createTeiEditor)',
    code: `import { createTeiEditor } from '${dist('index.js')}'; use(createTeiEditor);`,
  },
  {
    name: 'core + StarterKit',
    code: `import { createTeiEditor } from '${dist('index.js')}';
      import { StarterKit } from '${dist('extensions/starter-kit/index.js')}';
      use(createTeiEditor, StarterKit);`,
    budget: 20 * KB,
  },
  {
    name: '<Editor> (full preset, StarterKit)',
    code: `import { Editor } from '${dist('react/index.js')}'; use(Editor);`,
    budget: 60 * KB,
  },
  {
    name: 'headless React (useTeiEditor, EditorContent)',
    code: `import { useTeiEditor, EditorContent } from '${dist('react/index.js')}';
      use(useTeiEditor, EditorContent);`,
  },
  {
    name: 'server (renderToHTML)',
    code: `import { renderToHTML } from '${dist('server/index.js')}'; use(renderToHTML);`,
  },
];

/** Peers: the app has them already, whatever editor it uses. */
const external = ['lexical', '@lexical/*', 'react', 'react-dom', 'react/*', 'prismjs', 'prismjs/*'];

async function measure(code) {
  const result = await build({
    stdin: { contents: `${code}\nfunction use(...a) { globalThis.__used = a; }`, resolveDir: root },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    external,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const bytes = result.outputFiles[0].contents;
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
}

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
const rows = [];
let over = false;

for (const { name, code, budget } of CASES) {
  const { raw, gzip } = await measure(code);
  const fails = budget !== undefined && gzip > budget;
  over ||= fails;
  rows.push([name, fmt(raw), fmt(gzip), budget ? fmt(budget) : '', fails ? 'OVER' : budget ? 'ok' : '']);
}

const css = readFileSync(dist('styles.css'));
const cssGzip = gzipSync(css, { level: 9 }).length;
const cssBudget = 12 * KB;
over ||= cssGzip > cssBudget;
rows.push(['styles.css', fmt(css.length), fmt(cssGzip), fmt(cssBudget), cssGzip > cssBudget ? 'OVER' : 'ok']);

const head = ['case', 'min', 'min+gzip', 'budget', ''];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
console.log(line(head));
for (const row of rows) console.log(line(row));
if (over) {
  console.error('\nOver budget: see the cases marked OVER.');
  process.exit(1);
}
