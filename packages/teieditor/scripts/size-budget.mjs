/**
 * What an app ships for each way of using the package: the built entries
 * bundled the way an app's bundler would (minified, tree-shaken, gzipped),
 * with the peers (Lexical, React) left out, since the app has those anyway.
 * Fails when a budgeted case goes over.
 *
 *   yarn size          (after `yarn build`)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

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
    name: '<Editor> (StarterKit)',
    code: `import { Editor } from '${dist('react/index.js')}'; use(Editor);`,
    // The drop-in UI and StarterKit. The rest of the UI loads after the
    // editor shows, and only for the extensions installed; presets are
    // entries of their own, measured below.
    budget: 48 * KB,
  },
  {
    // The sum of its extensions, each budgeted below: this catches what
    // they share growing, and anything the preset pulls in by accident.
    name: '<Editor> + presets/notion',
    code: `import { Editor } from '${dist('react/index.js')}';
      import { notion } from '${dist('presets/notion.js')}'; use(Editor, notion);`,
    budget: 104 * KB,
  },
  {
    name: '<Editor> + presets/full',
    code: `import { Editor } from '${dist('react/index.js')}';
      import { full } from '${dist('presets/full.js')}'; use(Editor, full);`,
    // notion's, a toolbar, the document tools, comments and dictation.
    budget: 118 * KB,
  },
  {
    name: 'headless React (useTeiEditor, EditorContent)',
    code: `import { useTeiEditor, EditorContent } from '${dist('react/index.js')}';
      use(useTeiEditor, EditorContent);`,
  },
  {
    // Every icon is its own export: one costs its path data, not the set's.
    name: 'one icon',
    code: `import { bold } from '${dist('icons/index.js')}'; use(bold);`,
    budget: 0.5 * KB,
  },
  {
    name: 'server (renderToHTML)',
    code: `import { renderToHTML } from '${dist('server/index.js')}'; use(renderToHTML);`,
  },
];

/** Peers: the app has them already, whatever editor it uses. */
const external = [
  'lexical',
  '@lexical/*',
  'react',
  'react-dom',
  'react/*',
  'prismjs',
  'prismjs/*',
  // Optional peers, for the features that need them.
  'yjs',
  'y-protocols/*',
  'katex',
  '@excalidraw/*',
  'shiki',
  '@shikijs/*',
]

/**
 * Bundled as an app's bundler does it (Rolldown, Vite's): what loads up
 * front is the entry and the chunks it imports; the parts it `import()`s
 * (the UI for tables, images, code blocks) are `lazy`, fetched after the
 * editor shows.
 */
async function measure(code) {
  const ENTRY = '\0size-entry';
  const bundle = await rolldown({
    input: ENTRY,
    cwd: root,
    external: (id) => external.some((pattern) => (pattern.endsWith('/*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern)),
    plugins: [
      {
        name: 'size-entry',
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) => (id === ENTRY ? `${code}\nfunction use(...a) { globalThis.__used = a; }` : null),
      },
    ],
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    logLevel: 'silent',
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  const chunks = new Map(output.filter((o) => o.type === 'chunk').map((chunk) => [chunk.fileName, chunk]));
  const initial = new Set();
  const visit = (name) => {
    if (initial.has(name) || !chunks.has(name)) return;
    initial.add(name);
    for (const dep of chunks.get(name)?.imports ?? []) visit(dep);
  };
  visit([...chunks.values()].find((chunk) => chunk.isEntry).fileName);
  const size = (names) => ({
    raw: names.reduce((sum, name) => sum + Buffer.byteLength(chunks.get(name).code), 0),
    gzip: names.reduce((sum, name) => sum + gzipSync(chunks.get(name).code, { level: 9 }).length, 0),
  });
  const lazy = [...chunks.keys()].filter((name) => !initial.has(name));
  return { ...size([...initial]), lazy: size(lazy).gzip };
}

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
const rows = [];
let over = false;

for (const { name, code, budget } of CASES) {
  const { raw, gzip, lazy } = await measure(code);
  const fails = budget !== undefined && gzip > budget;
  over ||= fails;
  rows.push([
    name,
    fmt(raw),
    fmt(gzip),
    lazy ? `+${fmt(lazy)}` : '',
    budget ? fmt(budget) : '',
    fails ? 'OVER' : budget ? 'ok' : '',
  ]);
}

/**
 * Each extension on its own: what adding it to core + StarterKit costs.
 * A new extension gets the default budget; one that needs more says why.
 */
const EXTENSION_BUDGET = 6 * KB;
const EXTENSION_BUDGETS = {
  // Its providers: each one's URL patterns, iframe rules and privacy hosts.
  embed: 8 * KB,
  // Upload, resize, captions in a nested editor.
  image: 9 * KB,
  // Its own tokenizer over Shiki's core (Shiki itself is the app's), and the language and theme lists.
  'code-shiki': 9 * KB,
};
const BASE = `import { createTeiEditor } from '${dist('index.js')}';
  import { StarterKit } from '${dist('extensions/starter-kit/index.js')}';`;
const base = await measure(`${BASE} use(createTeiEditor, StarterKit);`);
const extensions = readdirSync(dist('extensions'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'starter-kit')
  .map((entry) => entry.name)
  .sort();
for (const name of extensions) {
  const { gzip } = await measure(
    `${BASE} import * as ext from '${dist(`extensions/${name}/index.js`)}'; use(createTeiEditor, StarterKit, ext);`,
  );
  const cost = Math.max(0, gzip - base.gzip);
  const budget = EXTENSION_BUDGETS[name] ?? EXTENSION_BUDGET;
  const fails = cost > budget;
  over ||= fails;
  rows.push([`+ extensions/${name}`, '', `+${fmt(cost)}`, '', fmt(budget), fails ? 'OVER' : 'ok']);
}

/** Stylesheets: everything in one, and core.css for an editor that imports only what it uses. */
const STYLES = [
  // Every feature's styles, the optional ones too; core.css is the lean way in.
  ['styles.css', 'styles.css', 19 * KB],
  ['styles/core.css', 'styles/core.css', 8 * KB],
];
for (const [name, path, budget] of STYLES) {
  const css = readFileSync(dist(path));
  const gzip = gzipSync(css, { level: 9 }).length;
  const fails = gzip > budget;
  over ||= fails;
  rows.push([name, fmt(css.length), fmt(gzip), '', fmt(budget), fails ? 'OVER' : 'ok']);
}

const head = ['case', 'min', 'min+gzip', 'lazy', 'budget', ''];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
console.log(line(head));
for (const row of rows) console.log(line(row));
if (over) {
  console.error('\nOver budget: see the cases marked OVER.');
  process.exit(1);
}
