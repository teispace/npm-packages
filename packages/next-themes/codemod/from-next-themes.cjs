/**
 * jscodeshift transform: migrate from `next-themes` to `@teispace/next-themes`.
 *
 * Rewrites:
 *   - `import ... from 'next-themes'` → `'@teispace/next-themes'`
 *   - `require('next-themes')` → `require('@teispace/next-themes')`
 *   - `import ... from 'next-themes/dist/...'` → `'@teispace/next-themes/...'`
 *   - Dynamic `import('next-themes')` → `import('@teispace/next-themes')`
 *
 * Options (via `--OPT=VALUE` on the jscodeshift CLI):
 *   --storage=hybrid|cookie|local|session|none
 *     Add a `storage={...}` prop to every <ThemeProvider>. Leave unset to
 *     accept the default (`hybrid`).
 *
 * Usage:
 *   npx jscodeshift --parser=tsx \
 *     -t node_modules/@teispace/next-themes/codemod/from-next-themes.cjs \
 *     src/
 */

const SOURCE = 'next-themes';
const TARGET = '@teispace/next-themes';
const DIST_PREFIX = 'next-themes/dist/';

function rewriteSpecifier(value) {
  if (value === SOURCE) return TARGET;
  if (value.startsWith(DIST_PREFIX)) {
    const rest = value.slice(DIST_PREFIX.length);
    return rest ? `${TARGET}/${rest}` : TARGET;
  }
  if (value === `${SOURCE}/`) return `${TARGET}/`;
  return null;
}

module.exports = function transform(fileInfo, api, options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  // import ... from 'next-themes'
  root.find(j.ImportDeclaration).forEach((path) => {
    const current = path.node.source.value;
    if (typeof current !== 'string') return;
    const next = rewriteSpecifier(current);
    if (next) {
      path.node.source.value = next;
      changed = true;
    }
  });

  // export ... from 'next-themes'
  for (const type of ['ExportAllDeclaration', 'ExportNamedDeclaration']) {
    root.find(j[type]).forEach((path) => {
      const src = path.node.source;
      if (!src || typeof src.value !== 'string') return;
      const next = rewriteSpecifier(src.value);
      if (next) {
        src.value = next;
        changed = true;
      }
    });
  }

  // require('next-themes')
  root
    .find(j.CallExpression, {
      callee: { type: 'Identifier', name: 'require' },
    })
    .forEach((path) => {
      const arg = path.node.arguments[0];
      if (!arg || arg.type !== 'Literal' && arg.type !== 'StringLiteral') return;
      const value = arg.value;
      if (typeof value !== 'string') return;
      const next = rewriteSpecifier(value);
      if (next) {
        arg.value = next;
        changed = true;
      }
    });

  // dynamic import('next-themes')
  root.find(j.CallExpression, { callee: { type: 'Import' } }).forEach((path) => {
    const arg = path.node.arguments[0];
    if (!arg) return;
    if (arg.type === 'Literal' || arg.type === 'StringLiteral') {
      const value = arg.value;
      if (typeof value !== 'string') return;
      const next = rewriteSpecifier(value);
      if (next) {
        arg.value = next;
        changed = true;
      }
    }
  });

  // Optional: add storage={...} to <ThemeProvider> elements.
  const storageMode = options && options.storage;
  if (storageMode) {
    if (!['hybrid', 'cookie', 'local', 'session', 'none'].includes(storageMode)) {
      throw new Error(
        `codemod: invalid --storage value '${storageMode}'. Expected one of: hybrid, cookie, local, session, none`,
      );
    }
    root
      .find(j.JSXOpeningElement, { name: { name: 'ThemeProvider' } })
      .forEach((path) => {
        const attrs = path.node.attributes || [];
        const hasStorage = attrs.some(
          (a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'storage',
        );
        if (!hasStorage) {
          path.node.attributes.push(
            j.jsxAttribute(j.jsxIdentifier('storage'), j.stringLiteral(storageMode)),
          );
          changed = true;
        }
      });
  }

  return changed ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'tsx';
