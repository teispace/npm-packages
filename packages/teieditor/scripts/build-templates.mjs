/**
 * The source of each React component, as an app would write it: its
 * imports of the package's own modules rewritten to the public entries
 * (`@teispace/teieditor/react`, `@teispace/teieditor`, an extension's), so a
 * copied component builds in any app and still gets the package's fixes for
 * everything it uses. `npx teieditor add` copies these; the shadcn registry
 * serves the same files.
 *
 *   dist/templates/<name>.tsx      one per component
 *   dist/templates/manifest.json   names, descriptions, dependencies
 *   dist/registry/<name>.json      shadcn registry items, and index.json
 *
 * Fails when a component uses something no public entry exports: a copied
 * component can only use what an app can import.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (path) => resolve(root, 'src', path);
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const COMPONENTS = src('react/components');

/** Public entries, the first that exports a symbol wins. */
const ENTRIES = [
  ['@teispace/teieditor/react', src('react/index.ts')],
  ['@teispace/teieditor', src('index.ts')],
  ...readdirSync(src('extensions'))
    .sort()
    .map((dir) => [`@teispace/teieditor/extensions/${dir}`, src(`extensions/${dir}/index.ts`)]),
];

const files = readdirSync(COMPONENTS)
  .filter((name) => /\.tsx?$/.test(name))
  .sort();
const program = ts.createProgram(
  [...ENTRIES.map(([, file]) => file), ...files.map((name) => resolve(COMPONENTS, name))],
  {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  },
);
const checker = program.getTypeChecker();

const resolved = (symbol) =>
  symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
const keyOf = (symbol) => {
  const decl = symbol.declarations?.[0];
  return decl ? `${decl.getSourceFile().fileName}#${symbol.name}` : null;
};

/** Where an app imports each declaration from. */
const publicEntry = new Map();
for (const [spec, file] of ENTRIES) {
  const module = checker.getSymbolAtLocation(program.getSourceFile(file));
  for (const exported of checker.getExportsOfModule(module)) {
    const key = keyOf(resolved(exported));
    if (key && !publicEntry.has(key)) publicEntry.set(key, { spec, name: exported.name });
  }
}

/** The first sentence of the first exported declaration's doc comment. */
function describe(source) {
  for (const statement of source.statements) {
    const exported = ts
      .getModifiers?.(statement)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    const docs = ts.getJSDocCommentsAndTags(statement).filter(ts.isJSDoc);
    const text = ts.getTextOfJSDocComment(docs[0]?.comment);
    if (text) return text.replace(/\s+/g, ' ').split(/(?<=\.)\s/)[0];
  }
  return '';
}

const problems = [];
const manifest = {};
const templatesDir = resolve(root, 'dist/templates');
const registryDir = resolve(root, 'dist/registry');
mkdirSync(templatesDir, { recursive: true });
mkdirSync(registryDir, { recursive: true });

for (const file of files) {
  const path = resolve(COMPONENTS, file);
  const source = program.getSourceFile(path);
  const text = source.getFullText();
  const name = basename(file).replace(/\.tsx?$/, '');
  /** spec -> { values: Set, types: Set } */
  const rewritten = new Map();
  const bare = new Set();
  const cuts = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = statement.moduleSpecifier.text;
    if (!from.startsWith('.')) {
      bare.add(from.startsWith('@') ? from.split('/').slice(0, 2).join('/') : from.split('/')[0]);
      continue;
    }
    const clause = statement.importClause;
    if (!clause) {
      problems.push(`${file}: a side-effect import of ${from}`);
      continue;
    }
    if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      problems.push(`${file}: only named imports can be rewritten (${from})`);
      continue;
    }
    for (const element of clause.namedBindings.elements) {
      const key = keyOf(resolved(checker.getSymbolAtLocation(element.name)));
      const entry = key && publicEntry.get(key);
      if (!entry) {
        problems.push(`${file}: ${element.name.text} from ${from} is not public`);
        continue;
      }
      const local = element.name.text;
      const spec = entry.name === local ? local : `${entry.name} as ${local}`;
      const group = rewritten.get(entry.spec) ?? { values: new Set(), types: new Set() };
      (clause.isTypeOnly || element.isTypeOnly ? group.types : group.values).add(spec);
      rewritten.set(entry.spec, group);
    }
    cuts.push([statement.getFullStart(), statement.getEnd()]);
  }
  if (cuts.length === 0 && bare.size === 0) continue;

  const lines = [];
  for (const [spec, { values, types }] of [...rewritten].sort(([a], [b]) => a.localeCompare(b))) {
    const names = [
      ...[...types].filter((t) => !values.has(t)).map((t) => `type ${t}`),
      ...values,
    ].sort((a, b) => a.replace(/^type /, '').localeCompare(b.replace(/^type /, '')));
    const onlyTypes = values.size === 0;
    const list = onlyTypes ? names.map((n) => n.replace(/^type /, '')) : names;
    const head = `import ${onlyTypes ? 'type ' : ''}{ `;
    const tail = ` } from '${spec}';`;
    lines.push(
      head.length + list.join(', ').length + tail.length <= 100
        ? `${head}${list.join(', ')}${tail}`
        : `${head.trimEnd()}\n${list.map((n) => `  ${n},`).join('\n')}\n${tail.trimStart()}`,
    );
  }
  // Take the relative imports out, back to front, and put the public ones after the last import.
  let out = text;
  const lastImport = cuts.at(-1)?.[1] ?? 0;
  const after = text.slice(lastImport);
  out = text.slice(0, lastImport);
  for (const [start, end] of [...cuts].reverse()) out = out.slice(0, start) + out.slice(end);
  out = `${out.replace(/\n+$/, '')}\n${lines.join('\n')}${after}`;
  // Parts loaded later (`<Editor>`'s): from their own module, so they stay apart.
  out = out.replace(
    /import\('\.\/([\w-]+)\.js'\)/g,
    (_, part) => `import('@teispace/teieditor/react/components/${part}')`,
  );
  if (/import\(\s*['"]\./.test(out)) problems.push(`${file}: a relative dynamic import`);

  const target = file.endsWith('.ts') && !out.includes('</') ? `${name}.ts` : `${name}.tsx`;
  writeFileSync(resolve(templatesDir, target), out);
  const dependencies = ['@teispace/teieditor', ...[...bare].filter((d) => d !== 'react').sort()];
  manifest[name] = { file: target, description: describe(source), dependencies };
}

if (problems.length) {
  console.error(`Templates: ${problems.length} import(s) an app could not make:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
writeFileSync(resolve(templatesDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// The shadcn registry: one item per component, the same files.
const items = Object.entries(manifest).map(([name, { file, description, dependencies }]) => ({
  $schema: 'https://ui.shadcn.com/schema/registry-item.json',
  name: `teieditor-${name}`,
  type: 'registry:component',
  title: name,
  description,
  dependencies: dependencies.map((d) => (d === '@teispace/teieditor' ? `${d}@^${pkg.version}` : d)),
  files: [
    {
      path: `components/teieditor/${file}`,
      type: 'registry:component',
      target: `components/teieditor/${file}`,
      content: readFileSync(resolve(templatesDir, file), 'utf8'),
    },
  ],
}));
for (const item of items) {
  writeFileSync(resolve(registryDir, `${item.name}.json`), `${JSON.stringify(item, null, 2)}\n`);
}
// What there is, for a page that lists them: each item's JSON is what `shadcn add` takes.
writeFileSync(
  resolve(registryDir, 'index.json'),
  `${JSON.stringify(
    items.map(({ name, description }) => ({ name, description, url: `${name}.json` })),
    null,
    2,
  )}\n`,
);
console.log(`templates: ${items.length} components`);
