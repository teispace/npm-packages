import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../src/registry/build-registry.js';
import {
  bareSpecifier,
  extractDependencies,
  findGroup,
  GROUPS,
  listCopyableFiles,
} from '../../src/registry/manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '../..');
const REGISTRY_SRC = join(PACKAGE_ROOT, 'src', 'registry');

const ITEM_TYPES = new Set([
  'registry:lib',
  'registry:block',
  'registry:component',
  'registry:ui',
  'registry:hook',
  'registry:theme',
  'registry:page',
  'registry:file',
  'registry:style',
  'registry:base',
  'registry:font',
  'registry:item',
]);

interface RegistryFile {
  path: string;
  type: string;
  target: string;
  content?: string;
}
interface RegistryItem {
  $schema?: string;
  name: string;
  type: string;
  title: string;
  description: string;
  files: RegistryFile[];
  dependencies?: string[];
  registryDependencies?: string[];
  cssVars?: { light?: Record<string, string>; dark?: Record<string, string> };
}
interface RegistryManifest {
  $schema: string;
  name: string;
  homepage: string;
  items: RegistryItem[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// Generate the artifacts rather than assume `yarn build` ran. `registry.json`
// and `r/*.json` are gitignored build output, and CI runs the test job BEFORE
// the build job — reading them directly passed locally (stale files present)
// and failed with ENOENT on a clean checkout.
buildRegistry();
const manifest = readJson<RegistryManifest>(join(PACKAGE_ROOT, 'registry.json'));

describe('registry manifest (shared source of truth)', () => {
  it('every group points at a folder that exists and has files', () => {
    for (const group of GROUPS) {
      expect(existsSync(join(REGISTRY_SRC, group.path))).toBe(true);
      expect(listCopyableFiles(REGISTRY_SRC, group.path).length).toBeGreaterThan(0);
    }
  });

  it('group names are unique and every dep resolves', () => {
    const names = GROUPS.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
    for (const group of GROUPS) {
      for (const dep of group.deps) {
        expect(findGroup(dep), `${group.name} depends on unknown group ${dep}`).toBeDefined();
      }
    }
  });

  it('resolves bare package specifiers from import sources', () => {
    expect(bareSpecifier('@lexical/react/LexicalComposerContext')).toBe('@lexical/react');
    expect(bareSpecifier('@teispace/teieditor/extensions/starter-kit')).toBe('@teispace/teieditor');
    expect(bareSpecifier('lexical')).toBe('lexical');
    expect(bareSpecifier('../../ui/button')).toBeNull();
  });

  it('derives npm dependencies from real file contents', () => {
    const files = listCopyableFiles(REGISTRY_SRC, 'editors');
    const deps = extractDependencies(REGISTRY_SRC, files);
    // Our registry files deliberately import from the package — that is what
    // `dependencies` is for.
    expect(deps).toContain('@teispace/teieditor');
    // React is implicit in any shadcn project and must not be re-declared.
    expect(deps).not.toContain('react');
  });
});

describe('generated registry.json', () => {
  it('declares the shadcn registry schema', () => {
    expect(manifest.$schema).toBe('https://ui.shadcn.com/schema/registry.json');
    expect(manifest.name).toBe('teieditor');
    expect(typeof manifest.homepage).toBe('string');
  });

  it('is generated from GROUPS — one item per group, same order', () => {
    expect(manifest.items.map((i) => i.name)).toEqual(GROUPS.map((g) => g.name));
    for (const [index, group] of GROUPS.entries()) {
      const item = manifest.items[index] as RegistryItem;
      expect(item.type).toBe(group.type);
      expect(item.title).toBe(group.title);
      expect(item.description).toBe(group.description);
    }
  });

  it('mirrors the GROUPS dependency graph in registryDependencies', () => {
    for (const [index, group] of GROUPS.entries()) {
      const item = manifest.items[index] as RegistryItem;
      expect(item.registryDependencies ?? []).toEqual(group.deps.map((d) => `./${d}.json`));
    }
  });

  it('emits spec-conformant files entries with explicit targets', () => {
    for (const item of manifest.items) {
      expect(ITEM_TYPES.has(item.type)).toBe(true);
      expect(item.files.length).toBeGreaterThan(0);
      for (const file of item.files) {
        expect(ITEM_TYPES.has(file.type)).toBe(true);
        expect(existsSync(join(REGISTRY_SRC, file.path))).toBe(true);
        // Preserving the folder layout is what keeps the relative imports
        // between scaffolded files working.
        expect(file.target).toBe(`@components/teieditor/${file.path}`);
      }
    }
  });

  it('pins @teispace/teieditor to the packaged version', () => {
    const pkg = readJson<{ version: string }>(join(PACKAGE_ROOT, 'package.json'));
    const editorItem = manifest.items.find((i) => i.name === 'editor') as RegistryItem;
    expect(editorItem.dependencies).toContain(`@teispace/teieditor@^${pkg.version}`);
  });

  it('ships the --tei-* design tokens as cssVars on the root item', () => {
    const ui = manifest.items.find((i) => i.name === 'ui') as RegistryItem;
    expect(ui.cssVars?.light?.['tei-bg']).toBe('0 0% 100%');
    expect(ui.cssVars?.dark?.['tei-bg']).toBe('0 0% 3.9%');
    expect(Object.keys(ui.cssVars?.light ?? {}).length).toBeGreaterThan(20);
  });
});

describe('generated r/<item>.json', () => {
  it('emits one built item per group, with file contents inlined', () => {
    for (const group of GROUPS) {
      const path = join(PACKAGE_ROOT, 'r', `${group.name}.json`);
      expect(existsSync(path), `missing r/${group.name}.json`).toBe(true);

      const item = readJson<RegistryItem>(path);
      expect(item.$schema).toBe('https://ui.shadcn.com/schema/registry-item.json');
      expect(item.name).toBe(group.name);
      for (const file of item.files) {
        expect(file.content).toBe(readFileSync(join(REGISTRY_SRC, file.path), 'utf8'));
      }
    }
  });

  it('serves the index alongside the items', () => {
    const served = readJson<RegistryManifest>(join(PACKAGE_ROOT, 'r', 'registry.json'));
    expect(served.items.map((i) => i.name)).toEqual(manifest.items.map((i) => i.name));
  });
});
