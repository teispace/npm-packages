/**
 * Generates a shadcn-spec registry from {@link GROUPS}.
 *
 * Run with `yarn workspace @teispace/teieditor registry:build` (it is also
 * wired into `yarn build`, so publishing always ships a fresh registry).
 *
 * Emits, relative to the package root:
 *
 *   registry.json      the source manifest (schema: registry.json)
 *   r/registry.json    the same manifest, served alongside the items
 *   r/<item>.json      one built item per group, file contents inlined
 *                      (schema: registry-item.json)
 *
 * Consumers then run `npx shadcn@latest add <url-to>/r/editor.json`.
 *
 * Spec references:
 *   https://ui.shadcn.com/docs/registry
 *   https://ui.shadcn.com/docs/registry/registry-item-json
 *   https://ui.shadcn.com/docs/registry/getting-started
 *
 * NOTE: this file is a build-time script. It is not a tsup entry and is never
 * bundled into `dist/`, but it lives under `src/` so `tsc --noEmit` type-checks
 * it alongside everything else.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractDependencies,
  GROUPS,
  listCopyableFiles,
  type RegistryGroup,
  type RegistryItemType,
} from './manifest.js';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '../..');
const REGISTRY_SRC = join(PACKAGE_ROOT, 'src', 'registry');
const VARIABLES_CSS = join(PACKAGE_ROOT, 'src', 'themes', 'variables.css');
const OUT_DIR = join(PACKAGE_ROOT, 'r');
const SOURCE_MANIFEST = join(PACKAGE_ROOT, 'registry.json');

const REGISTRY_SCHEMA = 'https://ui.shadcn.com/schema/registry.json';
const REGISTRY_ITEM_SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';

/**
 * Where scaffolded files land in the consumer's project.
 *
 * `@components/` is a shadcn target placeholder that resolves to whatever the
 * project's `components` alias is. The `teieditor/` sub-tree mirrors the CLI's
 * default `src/components/teieditor`, and — critically — preserves the
 * relative imports our files use between each other (`../../ui/button`,
 * `../components/toolbar/toolbar`). Flattening the tree would break them.
 */
const TARGET_PREFIX = '@components/teieditor';

// ---------------------------------------------------------------------------
// shadcn registry types (subset we emit)
// ---------------------------------------------------------------------------

interface RegistryItemFile {
  path: string;
  type: RegistryItemType;
  target: string;
  content?: string;
}

interface RegistryItem {
  $schema?: string;
  name: string;
  type: RegistryItemType;
  title: string;
  description: string;
  author?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: RegistryItemFile[];
  cssVars?: {
    theme?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  meta?: Record<string, unknown>;
}

interface Registry {
  $schema: string;
  name: string;
  homepage: string;
  items: RegistryItem[];
}

// ---------------------------------------------------------------------------
// CSS variables
// ---------------------------------------------------------------------------

/**
 * Pull the `--tei-*` tokens out of `src/themes/variables.css` so `shadcn add`
 * injects them into the consumer's stylesheet. Without this every scaffolded
 * component renders unstyled until the user remembers to
 * `import '@teispace/teieditor/styles.css'`.
 *
 * shadcn's `cssVars` keys are written without the leading `--`.
 */
function parseCssVars(css: string, selector: string): Record<string, string> {
  const blockStart = css.indexOf(`${selector} {`);
  if (blockStart === -1) return {};
  const bodyStart = css.indexOf('{', blockStart) + 1;
  const bodyEnd = css.indexOf('}', bodyStart);
  const body = css.slice(bodyStart, bodyEnd);

  const vars: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const match = /^\s*--([\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (match) vars[match[1] as string] = (match[2] as string).trim();
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Item construction
// ---------------------------------------------------------------------------

interface BuildOptions {
  /**
   * Absolute base URL the registry will be served from, e.g.
   * `https://example.com/r`. When omitted, cross-item references are emitted
   * as relative file paths (`./ui.json`) — the form the spec sanctions for
   * local registry files. Pass `--base-url` when building for a host.
   */
  baseUrl?: string;
  packageVersion: string;
  packageName: string;
  homepage: string;
  author: string;
}

function itemRef(name: string, options: BuildOptions): string {
  return options.baseUrl ? `${options.baseUrl.replace(/\/$/, '')}/${name}.json` : `./${name}.json`;
}

/**
 * `@teispace/teieditor` is pinned to the version that generated the registry;
 * everything else (React/Lexical peers, lucide-react) floats, matching the
 * loose peer ranges in package.json.
 */
function pinDependency(pkg: string, options: BuildOptions): string {
  return pkg === options.packageName ? `${pkg}@^${options.packageVersion}` : pkg;
}

function buildItem(
  group: RegistryGroup,
  options: BuildOptions,
  cssVars?: RegistryItem['cssVars'],
): RegistryItem {
  const files = listCopyableFiles(REGISTRY_SRC, group.path);
  if (files.length === 0) {
    throw new Error(`Registry group "${group.name}" has no files under src/registry/${group.path}`);
  }

  const item: RegistryItem = {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: group.name,
    type: group.type,
    title: group.title,
    description: group.description,
    author: options.author,
    dependencies: extractDependencies(REGISTRY_SRC, files).map((p) => pinDependency(p, options)),
    registryDependencies: group.deps.map((dep) => itemRef(dep, options)),
    files: files.map((rel) => ({
      path: rel,
      // Every file in a group carries the group's own type. shadcn uses the
      // per-file type only to pick a default target, and we always set an
      // explicit target, so this stays purely informational.
      type: group.type,
      target: `${TARGET_PREFIX}/${rel}`,
    })),
    meta: {
      // Lets an agent map a registry item back to the CLI command that
      // scaffolds the identical files with drift detection.
      cliCommand: `npx teieditor add ${group.name}`,
    },
  };

  if (cssVars) item.cssVars = cssVars;
  if (item.dependencies?.length === 0) delete item.dependencies;
  if (item.registryDependencies?.length === 0) delete item.registryDependencies;

  return item;
}

/** Inline every file's content — this is what `shadcn add` actually reads. */
function withContent(item: RegistryItem): RegistryItem {
  return {
    ...item,
    files: item.files.map((file) => ({
      ...file,
      content: readFileSync(join(REGISTRY_SRC, file.path), 'utf8'),
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { baseUrl?: string } {
  const index = argv.indexOf('--base-url');
  if (index === -1) return {};
  const value = argv[index + 1];
  if (!value) throw new Error('--base-url requires a value, e.g. --base-url https://example.com/r');
  return { baseUrl: value };
}

function main(): void {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    homepage: string;
  };

  const options: BuildOptions = {
    ...parseArgs(process.argv.slice(2)),
    packageName: pkg.name,
    packageVersion: pkg.version,
    homepage: pkg.homepage,
    author: 'Teispace <https://github.com/teispace>',
  };

  const css = readFileSync(VARIABLES_CSS, 'utf8');
  const cssVars = {
    light: parseCssVars(css, ':root'),
    dark: parseCssVars(css, '.dark'),
  };

  // The `ui` group is the root of the dependency graph — every other item
  // depends on it — so attaching the design tokens there guarantees they are
  // installed exactly once, no matter which item the user adds.
  const items = GROUPS.map((group) =>
    buildItem(group, options, group.name === 'ui' ? cssVars : undefined),
  );

  const registry: Registry = {
    $schema: REGISTRY_SCHEMA,
    name: 'teieditor',
    homepage: pkg.homepage,
    items,
  };

  writeFileSync(SOURCE_MANIFEST, `${JSON.stringify(registry, null, 2)}\n`);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
  for (const item of items) {
    writeFileSync(
      join(OUT_DIR, `${item.name}.json`),
      `${JSON.stringify(withContent(item), null, 2)}\n`,
    );
  }

  const fileCount = items.reduce((sum, item) => sum + item.files.length, 0);
  console.log(
    `registry: ${items.length} items / ${fileCount} files → registry.json + r/*.json` +
      (options.baseUrl ? ` (base URL ${options.baseUrl})` : ' (relative item refs)'),
  );
}

main();
