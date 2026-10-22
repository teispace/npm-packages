import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { setExtensionOptions } from '../../src/core/define.js';
import { Collaboration } from '../../src/extensions/collaboration/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  diffDocuments,
  diffWords,
  type TeiVersion,
  Versions,
  type VersionsOptions,
  type VersionsStorage,
} from '../../src/extensions/versions/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';
import { MemoryNetwork, MemoryProvider, settle } from './collab-network.js';

const editors: TeiEditor[] = [];
const providers: MemoryProvider[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const provider of providers.splice(0)) provider.destroy();
  document.body.replaceChildren();
});

function make(content = '<p>One</p>', options: Partial<VersionsOptions> = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Versions.configure(options)],
    content,
  });
  editors.push(editor);
  return { editor, storage: storageOf(editor) };
}

const storageOf = (editor: TeiEditor) =>
  editor.extension(Versions)?.output.storage as VersionsStorage;

function type(editor: TeiEditor, text: string) {
  editor.update(() => {
    $getRoot().selectEnd();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });
}

const addParagraph = (editor: TeiEditor, text: string) =>
  editor.update(() => {
    $getRoot().append($createParagraphNode().append($createTextNode(text)));
  });

const paragraphs = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((n) => n.getTextContent()),
  );

describe('Versions', () => {
  it('saves named versions, newest first, as JSON, and tells the app', () => {
    const onSave = vi.fn();
    const { editor, storage } = make('<p>One</p>', { onSave, author: 'Ada' });
    expect(storage.ready.peek()).toBe(true);
    expect(editor.commands.saveVersion()).toBe(true);
    addParagraph(editor, 'Two');
    editor.commands.saveVersion('  Draft  ');
    const list = storage.versions.peek();
    expect(list.map((v) => v.name)).toEqual(['Draft', 'Version 1']);
    expect(list[1]).toMatchObject({ kind: 'json', author: 'Ada' });
    expect(list[1]?.content?.root.children).toHaveLength(1);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]?.[0]).toBe(list[0]);
    // Plain JSON all the way through.
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
  });

  it('restores a version as one undo step', async () => {
    const { editor, storage } = make('<p>One</p>');
    const first = storage.save('First');
    addParagraph(editor, 'Two');
    type(editor, ' more');
    await new Promise((r) => setTimeout(r, 350)); // past History's merge delay
    expect(editor.commands.restoreVersion(first.id)).toBe(true);
    expect(paragraphs(editor)).toEqual(['One']);
    type(editor, '!');
    editor.commands.undo();
    expect(paragraphs(editor)).toEqual(['One']);
    editor.commands.undo();
    expect(paragraphs(editor)).toEqual(['One', 'Two more']);
  });

  it('will not restore what is not there, or into a read-only editor', () => {
    const { editor, storage } = make();
    expect(editor.can().restoreVersion('nope')).toBe(false);
    expect(editor.commands.restoreVersion('nope')).toBe(false);
    const v = storage.save();
    editor.setEditable(false);
    expect(editor.can().restoreVersion(v.id)).toBe(false);
    expect(storage.restore(v.id)).toBe(false);
  });

  it('deletes and renames, telling the app', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const { editor, storage } = make('<p>x</p>', { onSave, onDelete });
    const a = storage.save('A');
    const b = storage.save('B');
    storage.preview(a.id);
    expect(storage.previewing.peek()).toBe(a.id);
    expect(editor.commands.deleteVersion(a.id)).toBe(true);
    expect(onDelete).toHaveBeenCalledWith(a);
    expect(storage.previewing.peek()).toBeNull();
    expect(editor.commands.renameVersion(b.id, 'Final')).toBe(true);
    expect(storage.get(b.id)?.name).toBe('Final');
    expect(onSave).toHaveBeenLastCalledWith({ ...b, name: 'Final' });
    expect(storage.rename(b.id, '  ')).toBe(false);
    expect(storage.remove('gone')).toBe(false);
  });

  it('loads saved versions, and keeps at most `max`', async () => {
    const saved: TeiVersion[] = [
      { id: 'old', name: 'Old', createdAt: 1, kind: 'json', content: undefined },
      { id: 'mid', name: 'Mid', createdAt: 2, kind: 'json' },
    ];
    const onDelete = vi.fn();
    const { storage } = make('<p>x</p>', {
      load: () => new Promise((resolve) => setTimeout(() => resolve(saved), 5)),
      max: 2,
      onDelete,
    });
    expect(storage.ready.peek()).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(storage.ready.peek()).toBe(true);
    expect(storage.versions.peek().map((v) => v.id)).toEqual(['mid', 'old']);
    storage.save('New');
    expect(storage.versions.peek().map((v) => v.name)).toEqual(['New', 'Mid']);
    expect(onDelete).toHaveBeenCalledWith(saved[0]);
  });

  it('reports a failed load and carries on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storage } = make('<p>x</p>', { load: () => Promise.reject(new Error('offline')) });
    await settle();
    expect(storage.ready.peek()).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('compares a version with now, block by block and word by word', () => {
    const { editor, storage } = make('<p>The quick fox</p><p>Stays</p><p>Goes away</p>');
    const v = storage.save();
    editor.setContent('<p>The slow fox</p><p>Stays</p><p>Brand new</p><p>And more</p>');
    const diff = storage.compare(v.id);
    expect(diff?.blocks.map((b) => b.kind)).toEqual(['changed', 'same', 'changed', 'added']);
    expect(diff).toMatchObject({ added: 1, removed: 0, changed: 2 });
    const first = diff?.blocks[0];
    expect(first?.kind === 'changed' && first.words).toEqual([
      { kind: 'same', text: 'The ' },
      { kind: 'removed', text: 'quick' },
      { kind: 'added', text: 'slow' },
      { kind: 'same', text: ' fox' },
    ]);
    expect(storage.compare('missing')).toBeNull();
    const w = storage.save();
    expect(storage.compare(w.id)?.blocks.every((b) => b.kind === 'same')).toBe(true);
  });

  it('draws a version read-only, with the editor’s theme', () => {
    const { editor, storage } = make('<h2>Title</h2><p>Body</p>');
    const v = storage.save();
    editor.setContent('<p>Changed</p>');
    const box = document.createElement('div');
    document.body.append(box);
    const stop = storage.renderPreview(v.id, box);
    expect(box.textContent).toContain('Title');
    expect(box.textContent).toContain('Body');
    expect(box.querySelector('h2')).not.toBeNull();
    expect(box.getAttribute('contenteditable')).toBe('false');
    stop();
    expect(storage.renderPreview('nope', box)).toBeTypeOf('function');
  });

  it('opens and closes the panel by command', () => {
    const { editor, storage } = make();
    expect(editor.isActive('versionsOpen')).toBe(false);
    editor.commands.toggleVersions();
    expect(storage.panelOpen.peek()).toBe(true);
    expect(editor.isActive('versionsOpen')).toBe(true);
    editor.commands.toggleVersions(false);
    expect(storage.panelOpen.peek()).toBe(false);
    expect(editor.items('document').map((i) => i.id)).toEqual(
      expect.arrayContaining(['saveVersion', 'versionHistory']),
    );
  });
});

describe('diff', () => {
  const doc = (...texts: string[]) => ({
    root: {
      type: 'root',
      version: 1,
      children: texts.map((text) => ({
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', version: 1, text }],
      })),
    },
  });

  it('marks blocks added, removed and kept', () => {
    const diff = diffDocuments(doc('a', 'b', 'c') as never, doc('a', 'c', 'd') as never);
    expect(diff.blocks).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
  });

  it('marks words, keeping the spaces', () => {
    expect(diffWords('one two three', 'one three four')).toEqual([
      { kind: 'same', text: 'one ' },
      { kind: 'removed', text: 'two ' },
      { kind: 'same', text: 'three' },
      { kind: 'added', text: ' four' },
    ]);
    expect(diffWords('', 'new')).toEqual([{ kind: 'added', text: 'new' }]);
  });
});

describe('Versions with collaboration', () => {
  function client(network: MemoryNetwork, doc: Y.Doc, content?: string) {
    const provider = new MemoryProvider(doc, network);
    providers.push(provider);
    const editor = createTeiEditor({
      extensions: [StarterKit, Collaboration.configure({ doc, provider }), Versions],
      content,
    });
    editors.push(editor);
    return { editor, storage: storageOf(editor) };
  }

  it('keeps Yjs snapshots that everyone sees, and restores one for everyone', async () => {
    const network = new MemoryNetwork();
    const a = client(network, new Y.Doc({ gc: false }), '<p>One</p>');
    await settle();
    const b = client(network, new Y.Doc({ gc: false }));
    await settle();
    const v = a.storage.save('Start');
    expect(v.kind).toBe('yjs');
    expect(v.snapshot).toBeTruthy();
    expect(v.content).toBeUndefined();
    expect(b.storage.versions.peek().map((x) => x.name)).toEqual(['Start']);
    addParagraph(b.editor, 'Two');
    await settle();
    expect(paragraphs(a.editor)).toEqual(['One', 'Two']);
    // B restores the version A saved.
    expect(b.editor.commands.restoreVersion(v.id)).toBe(true);
    await settle();
    expect(paragraphs(a.editor)).toEqual(['One']);
    expect(paragraphs(b.editor)).toEqual(['One']);
    // One undo step, B's own.
    b.editor.commands.undo();
    await settle();
    expect(paragraphs(a.editor)).toEqual(['One', 'Two']);
    // Renames and deletes reach everyone too.
    a.storage.rename(v.id, 'Beginning');
    expect(b.storage.get(v.id)?.name).toBe('Beginning');
    b.storage.remove(v.id);
    expect(a.storage.versions.peek()).toEqual([]);
  });

  it('falls back to JSON on a document that collects garbage', async () => {
    const network = new MemoryNetwork();
    const a = client(network, new Y.Doc(), '<p>One</p>');
    await settle();
    const v = a.storage.save();
    expect(v.kind).toBe('json');
    expect(a.storage.content(v.id)?.root.children).toHaveLength(1);
  });

  it('keeps the list local with `shared: false`', async () => {
    const network = new MemoryNetwork();
    const make2 = (doc: Y.Doc) => {
      const provider = new MemoryProvider(doc, network);
      providers.push(provider);
      const editor = createTeiEditor({
        extensions: [
          StarterKit,
          Collaboration.configure({ doc, provider }),
          Versions.configure({ shared: false }),
        ],
      });
      editors.push(editor);
      return storageOf(editor);
    };
    const a = make2(new Y.Doc());
    const b = make2(new Y.Doc());
    await settle();
    a.save('Mine');
    expect(b.versions.peek()).toEqual([]);
  });

  it('loaded versions join the shared list once', async () => {
    const network = new MemoryNetwork();
    const saved: TeiVersion[] = [{ id: 'kept', name: 'Kept', createdAt: 1, kind: 'json' }];
    const make2 = (doc: Y.Doc) => {
      const provider = new MemoryProvider(doc, network);
      providers.push(provider);
      const editor = createTeiEditor({
        extensions: [
          StarterKit,
          Collaboration.configure({ doc, provider }),
          Versions.configure({ load: () => saved }),
        ],
      });
      editors.push(editor);
      return storageOf(editor);
    };
    const a = make2(new Y.Doc());
    const b = make2(new Y.Doc());
    await settle();
    expect(a.versions.peek().map((v) => v.id)).toEqual(['kept']);
    expect(b.versions.peek().map((v) => v.id)).toEqual(['kept']);
    setExtensionOptions(editors[0] as TeiEditor, Versions, { max: 5 });
  });
});
