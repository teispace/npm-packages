import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Table } from '../../src/extensions/table/index.js';
import { createTeiEditor, flattenExtensions, type TeiEditor } from '../../src/index.js';
import { full, minimal, notion } from '../../src/presets/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

const names = (preset: { extensions: Parameters<typeof flattenExtensions>[0] }) =>
  flattenExtensions(preset.extensions).map((ext) => (Array.isArray(ext) ? ext[0] : ext).name);

describe('presets', () => {
  it('build an editor headless, every extension resolving', () => {
    for (const preset of [full, notion, minimal]) {
      const editor = createTeiEditor({ extensions: preset.extensions, content: '<p>Hi</p>' });
      editors.push(editor);
      expect(editor.getText()).toBe('Hi');
    }
  });

  it('full is notion plus the document tools, with nothing twice', () => {
    const fullNames = names(full);
    expect(new Set(fullNames).size).toBe(fullNames.length);
    for (const name of names(notion)) expect(fullNames).toContain(name);
    expect(fullNames).toContain('@teispace/teieditor/document-actions');
    expect(names(notion)).not.toContain('@teispace/teieditor/document-actions');
  });

  it('say which UI they leave out', () => {
    expect(notion.ui).toEqual({ toolbar: false, wordCount: false });
    expect(full.ui).toEqual({});
    expect(minimal.ui.bubbleMenu).toBe(false);
  });

  it('name each feature by its directory, which <Editor> looks it up by', () => {
    const dirs = new Set(readdirSync(resolve(__dirname, '../../src/extensions')));
    // StarterKit is a set; the features are each their own.
    const own = full.extensions.filter((ext) => !Array.isArray(ext));
    for (const { name } of own as { name: string }[]) {
      expect(name.startsWith('@teispace/teieditor/')).toBe(true);
      expect(dirs.has(name.slice('@teispace/teieditor/'.length))).toBe(true);
    }
  });
});

describe('editor.extension by name', () => {
  it('finds an installed extension without its import, and not an absent one', () => {
    const editor = createTeiEditor({ extensions: [...minimal.extensions, Table] });
    editors.push(editor);
    const byName = editor.extension('@teispace/teieditor/table');
    expect(byName).toBeDefined();
    expect(byName?.output).toBe(editor.extension(Table)?.output);
    expect(editor.extension('@teispace/teieditor/image')).toBeUndefined();
  });
});
