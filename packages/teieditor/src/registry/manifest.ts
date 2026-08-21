/**
 * The registry manifest — the SINGLE source of truth for what can be
 * scaffolded out of `src/registry/`.
 *
 * Two consumers read this module and nothing else:
 *
 *   1. `src/cli/index.ts` — the `teieditor init/add/update/list` commands,
 *      which copy files with SHA-256 drift detection.
 *   2. `src/registry/build-registry.ts` — the generator that emits a
 *      shadcn-spec `registry.json` + `r/<item>.json` so `npx shadcn add <url>`
 *      and coding agents can consume the same components.
 *
 * This module replaced the old `src/registry/index.ts`, which was dead code:
 * nothing imported it, it was not a tsup entry, its two entries contradicted
 * the ten real groups here, and its file paths did not match the layout on
 * disk. Anything describing the registry belongs here now — a second
 * hand-maintained list is exactly how that file rotted.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * shadcn registry item types we emit. The full enum is larger (see
 * https://ui.shadcn.com/docs/registry/registry-item-json) but these three are
 * the only ones that describe what we ship.
 */
export type RegistryItemType = 'registry:ui' | 'registry:component' | 'registry:block';

/**
 * A "group" is a top-level folder under `src/registry/` that a user can
 * scaffold independently. It maps 1:1 onto a shadcn registry item.
 */
export interface RegistryGroup {
  /** Unique id. Used as both the CLI group name and the registry item name. */
  name: string;
  /** Human-readable title for the registry item. */
  title: string;
  /** One-line summary, shown in `teieditor list` and in the registry item. */
  description: string;
  /** Folder under `src/registry/` (e.g. "ui", "components/toolbar"). */
  path: string;
  /** Other groups this group needs to function. */
  deps: string[];
  /** shadcn registry item type. */
  type: RegistryItemType;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export const GROUPS: RegistryGroup[] = [
  {
    name: 'ui',
    title: 'TeiEditor UI Primitives',
    description: 'Primitives (button, dropdown, modal, icons, ...)',
    path: 'ui',
    deps: [],
    type: 'registry:ui',
  },
  {
    name: 'toolbar',
    title: 'TeiEditor Toolbar',
    description: 'Top toolbar with formatting, blocks, fonts, colors',
    path: 'components/toolbar',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'bubble-menu',
    title: 'TeiEditor Bubble Menu',
    description: 'Floating format menu shown on text selection',
    path: 'components/bubble-menu',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'slash-menu',
    title: 'TeiEditor Slash Menu',
    description: '/ slash-command palette',
    path: 'components/slash-menu',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'link-editor',
    title: 'TeiEditor Link Editor',
    description: 'Floating link view/edit popover',
    path: 'components/link-editor',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'mention-list',
    title: 'TeiEditor Mention List',
    description: '@-mention typeahead list',
    path: 'components/mention-list',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'table-menu',
    title: 'TeiEditor Table Menu',
    description: 'Table operations (insert row/col, delete, ...)',
    path: 'components/table-menu',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'context-menu',
    title: 'TeiEditor Context Menu',
    description: 'Right-click block menu',
    path: 'components/context-menu',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'code-bar',
    title: 'TeiEditor Code Bar',
    description: 'Code-block language selector + copy',
    path: 'components/code-bar',
    deps: ['ui'],
    type: 'registry:component',
  },
  {
    name: 'editor',
    title: 'TeiEditor',
    description: 'Full WYSIWYG preset (TeiEditor) — depends on everything above',
    path: 'editors',
    deps: [
      'ui',
      'toolbar',
      'bubble-menu',
      'slash-menu',
      'link-editor',
      'mention-list',
      'table-menu',
      'context-menu',
      'code-bar',
    ],
    type: 'registry:block',
  },
];

/** Look up a group by name. */
export function findGroup(name: string): RegistryGroup | undefined {
  return GROUPS.find((g) => g.name === name);
}

// ---------------------------------------------------------------------------
// File discovery (shared by the CLI copier and the registry generator, so the
// two can never disagree about which files belong to a group)
// ---------------------------------------------------------------------------

export const COPYABLE_EXTENSIONS = new Set(['.tsx', '.ts', '.css', '.md']);

/**
 * List every copyable file under `<root>/<sub>`, as paths relative to `root`
 * (e.g. `ui/button.tsx`). Returns `[]` when the folder does not exist.
 */
export function listCopyableFiles(root: string, sub: string): string[] {
  const base = join(root, sub);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        const dot = entry.lastIndexOf('.');
        if (dot > -1 && COPYABLE_EXTENSIONS.has(entry.slice(dot))) {
          out.push(relative(root, full));
        }
      }
    }
  };
  walk(base);
  return out.sort();
}

// ---------------------------------------------------------------------------
// npm dependency extraction
// ---------------------------------------------------------------------------

const IMPORT_SOURCE_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * Packages every shadcn project already has. Emitting them would make
 * `shadcn add` reinstall React for no reason.
 */
const IMPLICIT_DEPENDENCIES = new Set(['react', 'react-dom']);

/** `@lexical/react/LexicalComposerContext` → `@lexical/react`; `./foo` → null. */
export function bareSpecifier(source: string): string | null {
  if (source.startsWith('.') || source.startsWith('/')) return null;
  const parts = source.split('/');
  if (source.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] ?? null;
}

/**
 * Scan real file contents for the npm packages a group imports.
 *
 * Our registry files are deliberately NOT self-contained: they import from
 * `@teispace/teieditor/{core,plugins,utils,extensions/*}`. That is the same
 * shape Plate uses, and the spec's answer for it is the item's `dependencies`
 * array — so we derive that array from the source rather than curating it.
 */
export function extractDependencies(root: string, files: string[]): string[] {
  const found = new Set<string>();
  for (const rel of files) {
    const code = readFileSync(join(root, rel), 'utf8');
    IMPORT_SOURCE_RE.lastIndex = 0;
    let match: RegExpExecArray | null = IMPORT_SOURCE_RE.exec(code);
    while (match !== null) {
      const pkg = bareSpecifier(match[1] as string);
      if (pkg && !IMPLICIT_DEPENDENCIES.has(pkg)) found.add(pkg);
      match = IMPORT_SOURCE_RE.exec(code);
    }
  }
  return Array.from(found).sort();
}
