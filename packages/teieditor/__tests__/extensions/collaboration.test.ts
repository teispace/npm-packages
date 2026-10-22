import { HistoryExtension } from '@lexical/history';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from 'lexical';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  Collaboration,
  type CollaborationOptions,
  type CollaborationStorage,
  createBroadcastProvider,
} from '../../src/extensions/collaboration/index.js';
import { RichText } from '../../src/extensions/rich-text/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';
import { MemoryNetwork, MemoryProvider, settle } from './collab-network.js';

const editors: TeiEditor[] = [];
const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const provider of providers.splice(0)) provider.destroy();
  document.body.replaceChildren();
});

interface ClientOptions extends Partial<CollaborationOptions> {
  content?: unknown;
  history?: 'none' | 'before' | 'after';
  mount?: boolean;
}

function client(network: MemoryNetwork, options: ClientOptions = {}) {
  const { content, history = 'none', mount = false, ...collab } = options;
  const doc = collab.doc ?? new Y.Doc();
  const provider = new MemoryProvider(doc, network);
  providers.push(provider);
  const kit = history === 'none' ? [StarterKit.configure({ history: false })] : [StarterKit];
  const extension = Collaboration.configure({ doc, provider, undoDelay: 0, ...collab });
  const editor = createTeiEditor({
    extensions: history === 'before' ? [extension, ...kit] : [...kit, extension],
    content,
  });
  editors.push(editor);
  if (mount) {
    const frame = document.createElement('div');
    const root = document.createElement('div');
    root.contentEditable = 'true';
    frame.append(root);
    document.body.append(frame);
    editor.lexical.setRootElement(root);
  }
  return { editor, doc, provider, storage: storageOf(editor) };
}

const storageOf = (editor: TeiEditor) =>
  editor.extension(Collaboration)?.output.storage as CollaborationStorage;

/** Type at the end of the document, as one edit. */
function type(editor: TeiEditor, text: string) {
  editor.update(() => {
    const root = $getRoot();
    if (root.isEmpty()) root.append($createParagraphNode());
    root.selectEnd();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });
}

/** A new paragraph at the end, as one edit. */
function addParagraph(editor: TeiEditor, text: string) {
  editor.update(() => {
    $getRoot().append($createParagraphNode().append($createTextNode(text)));
  });
}

const paragraphs = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((node) => node.getTextContent()),
  );

describe('Collaboration: syncing', () => {
  it('two editors share one document, both ways', async () => {
    const network = new MemoryNetwork();
    const a = client(network);
    const b = client(network);
    await settle();
    type(a.editor, 'Hello');
    await settle();
    expect(b.editor.getText()).toBe('Hello');
    type(b.editor, ' world');
    await settle();
    expect(a.editor.getText()).toBe('Hello world');
    expect(paragraphs(a.editor)).toEqual(paragraphs(b.editor));
  });

  it('carries formatting and structure, not just text', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { content: '<h2>Title</h2><ul><li><strong>bold</strong></li></ul>' });
    await settle();
    const b = client(network);
    await settle();
    expect(b.editor.getHTML()).toBe(a.editor.getHTML());
    expect(b.editor.getHTML()).toContain('<h2');
    expect(b.editor.getHTML()).toContain('<strong');
  });

  it('concurrent edits made apart converge to the same document', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { content: '<p>one</p>' });
    await settle();
    const b = client(network);
    await settle();
    network.partition();
    addParagraph(a.editor, 'from A');
    type(b.editor, ' (B)');
    addParagraph(b.editor, 'from B');
    await settle();
    expect(a.editor.getText()).not.toContain('from B');
    network.heal();
    await settle();
    expect(paragraphs(a.editor)).toEqual(paragraphs(b.editor));
    const text = a.editor.getText();
    expect(text).toContain('one (B)');
    expect(text).toContain('from A');
    expect(text).toContain('from B');
  });

  it('a document with content already in the Y.Doc is loaded, not overwritten', async () => {
    const network = new MemoryNetwork();
    const first = client(network, { content: '<p>Saved</p><p>Twice</p>' });
    await settle();
    // A later session, from the stored document, with nobody else online.
    const stored = new Y.Doc();
    Y.applyUpdate(stored, Y.encodeStateAsUpdate(first.doc));
    const later = client(new MemoryNetwork(), {
      doc: stored,
      content: '<p>Something else</p>',
    });
    await settle();
    expect(paragraphs(later.editor)).toEqual(['Saved', 'Twice']);
    // And it still edits the shared document.
    type(later.editor, '!');
    expect(stored.get('root', Y.XmlText).length).toBeGreaterThan(0);
    const check = new Y.Doc();
    Y.applyUpdate(check, Y.encodeStateAsUpdate(stored));
    expect(paragraphs(later.editor)).toEqual(['Saved', 'Twice!']);
  });

  it('takes its document from a provider factory, by id', async () => {
    const network = new MemoryNetwork();
    const docMap = new Map<string, Y.Doc>();
    let made: MemoryProvider | null = null;
    const editor = createTeiEditor({
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({
          id: 'doc-7',
          docMap,
          provider: (id, map) => {
            const doc = new Y.Doc();
            map.set(id, doc);
            made = new MemoryProvider(doc, network);
            return made;
          },
        }),
      ],
      content: '<p>Factory</p>',
    });
    editors.push(editor);
    await settle();
    expect(made).not.toBeNull();
    expect(docMap.get('doc-7')).toBe(storageOf(editor).doc);
    expect(editor.getText()).toBe('Factory');
    providers.push(made as unknown as MemoryProvider);
  });

  it('says plainly what is missing', () => {
    expect(() => createTeiEditor({ extensions: [RichText, Collaboration.configure({})] })).toThrow(
      /needs a `provider`/,
    );
    expect(() =>
      createTeiEditor({
        extensions: [
          RichText,
          Collaboration.configure({
            provider: () => new MemoryProvider(new Y.Doc(), new MemoryNetwork()),
          }),
        ],
      }),
    ).toThrow(/no Y.Doc for "main"/);
  });
});

describe('Collaboration: seeding', () => {
  it('the first client seeds an empty document; the next one takes it, not its own', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { content: '<p>Seed</p>' });
    await settle();
    const b = client(network, { content: '<p>Seed</p>' });
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Seed']);
    expect(paragraphs(b.editor)).toEqual(['Seed']);
  });

  it('two clients that both seed at once end with one copy, not two', async () => {
    const network = new MemoryNetwork();
    network.partition();
    // Each finds the document empty and seeds it, unaware of the other.
    const a = client(network, { content: '<p>Welcome</p><p>Start here</p>' });
    const b = client(network, { content: '<p>Welcome</p><p>Start here</p>' });
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Welcome', 'Start here']);
    expect(paragraphs(b.editor)).toEqual(['Welcome', 'Start here']);
    network.heal();
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Welcome', 'Start here']);
    expect(paragraphs(b.editor)).toEqual(['Welcome', 'Start here']);
  });

  it('an empty paragraph seeded twice is still one paragraph', async () => {
    const network = new MemoryNetwork();
    network.partition();
    const a = client(network);
    const b = client(network);
    await settle();
    network.heal();
    await settle();
    expect(paragraphs(a.editor)).toEqual(['']);
    expect(paragraphs(b.editor)).toEqual(['']);
  });

  it('a seed made apart merges with edits made on the other copy', async () => {
    const network = new MemoryNetwork();
    network.partition();
    const a = client(network, { content: '<p>Hello</p>' });
    await settle();
    type(a.editor, ' there');
    const b = client(network, { content: '<p>Hello</p>' });
    await settle();
    network.heal();
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Hello there']);
    expect(paragraphs(b.editor)).toEqual(['Hello there']);
  });

  it('different seeds are both kept rather than corrupting the document', async () => {
    const network = new MemoryNetwork();
    network.partition();
    const a = client(network, { content: '<p>A</p>' });
    const b = client(network, { content: '<p>B</p>' });
    await settle();
    network.heal();
    await settle();
    expect(paragraphs(a.editor)).toEqual(paragraphs(b.editor));
    expect([...paragraphs(a.editor)].sort()).toEqual(['A', 'B']);
  });

  it('`initialContent` seeds in place of the editor content; `shouldBootstrap: false` never seeds', async () => {
    const network = new MemoryNetwork();
    const quiet = client(network, { shouldBootstrap: false, content: '<p>Not me</p>' });
    await settle();
    expect(quiet.doc.get('root', Y.XmlText).length).toBe(0);
    expect(quiet.editor.getText()).toBe('');
    const seeder = client(network, { initialContent: '# Doc', initialContentFormat: 'markdown' });
    await settle();
    expect(seeder.editor.getHTML()).toContain('<h1');
    expect(quiet.editor.getText()).toBe('Doc');
  });

  it('seeding is not an undo step', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { content: '<p>Seed</p>' });
    await settle();
    expect(a.storage.canUndo.peek()).toBe(false);
    expect(a.editor.can().undo()).toBe(false);
  });
});

describe('Collaboration: undo', () => {
  it('undoes only this user’s edits, and redoes them', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { content: '<p>Base</p>' });
    await settle();
    const b = client(network);
    await settle();
    addParagraph(a.editor, 'mine');
    addParagraph(b.editor, 'theirs');
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Base', 'mine', 'theirs']);
    expect(a.editor.can().undo()).toBe(true);
    a.editor.commands.undo();
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Base', 'theirs']);
    expect(paragraphs(b.editor)).toEqual(['Base', 'theirs']);
    expect(a.storage.canUndo.peek()).toBe(false);
    expect(a.storage.canRedo.peek()).toBe(true);
    a.editor.commands.redo();
    await settle();
    expect(paragraphs(b.editor)).toEqual(['Base', 'mine', 'theirs']);
  });

  it('typing within the undo delay is one step', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { undoDelay: 10_000 });
    await settle();
    type(a.editor, 'a');
    type(a.editor, 'b');
    type(a.editor, 'c');
    a.editor.commands.undo();
    await settle();
    expect(a.editor.getText()).toBe('');
    type(a.editor, 'x');
    a.storage.stopCapturing();
    type(a.editor, 'y');
    a.editor.commands.undo();
    await settle();
    expect(a.editor.getText()).toBe('x');
  });

  it('replaces History, whichever comes first', async () => {
    for (const history of ['before', 'after'] as const) {
      const network = new MemoryNetwork();
      const a = client(network, { history, content: '<p>Base</p>' });
      const b = client(network, { history });
      await settle();
      // Lexical's own history is off: it would undo the others' edits too.
      expect(a.editor.extension(HistoryExtension)?.output.disabled.peek()).toBe(true);
      addParagraph(a.editor, 'mine');
      addParagraph(b.editor, 'theirs');
      await settle();
      expect(a.editor.can().undo()).toBe(true);
      a.editor.commands.undo();
      await settle();
      expect(paragraphs(b.editor)).toEqual(['Base', 'theirs']);
    }
  });

  it('⌘Z goes to Yjs too', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { history: 'after', mount: true, content: '<p>Base</p>' });
    await settle();
    addParagraph(a.editor, 'mine');
    const root = a.editor.lexical.getRootElement() as HTMLElement;
    const isMac = /Mac|iP/.test(navigator.platform);
    root.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
    expect(paragraphs(a.editor)).toEqual(['Base']);
  });
});

describe('Collaboration: presence', () => {
  const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  const rangeBox = Range.prototype.getBoundingClientRect;
  const rangeRects = Range.prototype.getClientRects;
  beforeEach(() => {
    // jsdom lays nothing out: give ranges a box and elements an offset parent.
    Range.prototype.getBoundingClientRect = () => new DOMRect(40, 20, 0, 16);
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentElement;
      },
    });
  });
  afterEach(() => {
    if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
    Range.prototype.getBoundingClientRect = rangeBox;
    Range.prototype.getClientRects = rangeRects;
  });

  it('lists the others with their names and colours', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { user: { name: 'Ada', color: '#0090ff' } });
    const b = client(network, { user: { name: 'Bo', color: 'rgb(48, 164, 108)' } });
    await settle();
    expect(a.storage.peers.peek().map((p) => [p.name, p.color])).toEqual([
      ['Bo', 'rgb(48, 164, 108)'],
    ]);
    expect(b.storage.peers.peek().map((p) => p.name)).toEqual(['Ada']);
    expect(a.storage.self.peek()?.name).toBe('Ada');
    expect(a.storage.self.peek()?.clientId).toBe(a.doc.clientID);
  });

  it('a new name or colour reaches the others live', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { user: { name: 'Ada', color: '#0090ff' } });
    const b = client(network, { user: { name: 'Bo' } });
    await settle();
    // Without a colour, one is picked.
    expect(a.storage.peers.peek()[0]?.color).toMatch(/^#/);
    const { setExtensionOptions } = await import('../../src/core/define.js');
    setExtensionOptions(a.editor, Collaboration, { user: { name: 'Ada L.', color: '#e5484d' } });
    expect(b.storage.peers.peek()[0]).toMatchObject({ name: 'Ada L.', color: '#e5484d' });
  });

  it('without a name, a user is Anonymous (in the app’s words)', async () => {
    const network = new MemoryNetwork();
    const a = client(network);
    await settle();
    expect(a.storage.self.peek()?.name).toBe('Anonymous');
  });

  it('draws the others’ cursors with their names, hidden from screen readers', async () => {
    const network = new MemoryNetwork();
    const a = client(network, {
      mount: true,
      user: { name: 'Ada', color: '#0090ff' },
      content: '<p>Hello</p>',
    });
    const b = client(network, { mount: true, user: { name: 'Bo', color: '#30a46c' } });
    await settle();
    // Ada focuses and puts her caret in the text.
    a.editor.lexical.dispatchCommand(
      (await import('lexical')).FOCUS_COMMAND,
      new FocusEvent('focus'),
    );
    a.editor.update(() => $getRoot().selectEnd());
    await settle();
    const layer = document.querySelectorAll('[data-tei-collab-cursors]')[1] as HTMLElement;
    expect(layer).toBeTruthy();
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.classList.contains('tei-collab-cursors')).toBe(true);
    const caret = layer.querySelector('.tei-collab-caret') as HTMLElement;
    expect(caret).not.toBeNull();
    expect(caret.style.getPropertyValue('--lexical-cursor-color')).toBe('#0090ff');
    expect(caret.querySelector('.tei-collab-name')?.textContent).toBe('Ada');
    // Positioned by CSSOM, never a style attribute string from us.
    expect(caret.style.top).toBe('20px');
    expect(b.storage.peers.peek()[0]?.focusing).toBe(true);
    // Blur: the cursor goes.
    a.editor.lexical.dispatchCommand(
      (await import('lexical')).BLUR_COMMAND,
      new FocusEvent('blur'),
    );
    await settle();
    expect(b.storage.peers.peek()[0]?.focusing).toBe(false);
    expect(layer.querySelector('.tei-collab-caret')).toBeNull();
  });

  it('draws into a container of the app’s choosing', async () => {
    const network = new MemoryNetwork();
    const box = document.createElement('section');
    document.body.append(box);
    client(network, { mount: true, cursorsContainer: () => box });
    await settle();
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('.tei-collab-cursors')).toHaveLength(0);
  });
});

describe('Collaboration: connection', () => {
  it('reports connecting, connected and synced, and offline after disconnect', async () => {
    const network = new MemoryNetwork();
    const seen: string[] = [];
    const a = client(network);
    a.storage.status.subscribe((status) => seen.push(status));
    expect(a.storage.status.peek()).toBe('disconnected');
    await settle();
    expect(seen).toEqual(['disconnected', 'connecting', 'connected']);
    expect(a.storage.synced.peek()).toBe(true);
    expect(a.editor.can().connect()).toBe(false);
    expect(a.editor.commands.disconnect()).toBe(true);
    expect(a.storage.status.peek()).toBe('disconnected');
    expect(a.storage.synced.peek()).toBe(false);
    expect(a.editor.can().connect()).toBe(true);
  });

  it('edits made offline arrive on reconnect, and presence comes back', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { content: '<p>Base</p>', user: { name: 'Ada' } });
    const b = client(network, { user: { name: 'Bo' } });
    await settle();
    b.editor.commands.disconnect();
    expect(a.storage.peers.peek()).toEqual([]);
    addParagraph(b.editor, 'offline');
    addParagraph(a.editor, 'online');
    await settle();
    expect(a.editor.getText()).not.toContain('offline');
    b.editor.commands.connect();
    await settle();
    expect(paragraphs(a.editor)).toEqual(paragraphs(b.editor));
    expect(a.editor.getText()).toContain('offline');
    expect(b.editor.getText()).toContain('online');
    expect(a.storage.peers.peek().map((p) => p.name)).toEqual(['Bo']);
  });

  it('with `connect: false` it waits to be told', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { connect: false });
    await settle();
    expect(a.provider.connects).toBe(0);
    expect(a.storage.status.peek()).toBe('disconnected');
    a.editor.commands.connect();
    expect(a.provider.connects).toBe(1);
    expect(a.storage.status.peek()).toBe('connected');
  });

  it('destroy disconnects and lets go of everything', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { mount: true, content: '<p>Base</p>', user: { name: 'Ada' } });
    const b = client(network, { user: { name: 'Bo' } });
    await settle();
    expect(document.querySelector('[data-tei-collab-cursors]')).not.toBeNull();
    const before = a.editor.getText();
    a.editor.destroy();
    editors.splice(editors.indexOf(a.editor), 1);
    expect(a.provider.connected).toBe(false);
    expect(a.provider.listenerCount('sync')).toBe(0);
    expect(a.provider.listenerCount('status')).toBe(0);
    expect(b.storage.peers.peek()).toEqual([]);
    expect(document.querySelector('[data-tei-collab-cursors]')).toBeNull();
    expect(
      (a.editor.lexical as LexicalEditor & Record<symbol, unknown>)[
        Symbol.for('@lexical/yjs/UndoManager')
      ],
    ).toBeUndefined();
    // The shared document no longer reaches it.
    a.doc.get('root', Y.XmlText).insert(0, 'x');
    expect(a.editor.getText()).toBe(before);
  });

  it('a provider that only says `sync` still shows as connected', async () => {
    const network = new MemoryNetwork();
    const a = client(network);
    a.provider.emit = function emit(this: MemoryProvider, type: string, arg: unknown) {
      if (type === 'status') return;
      MemoryProvider.prototype.emit.call(this, type, arg);
    };
    await settle();
    expect(a.storage.status.peek()).toBe('connected');
  });
});

describe('Collaboration: snapshots and shared lists', () => {
  it('snapshots a gc-free document and reads it back as JSON', async () => {
    const network = new MemoryNetwork();
    const a = client(network, { doc: new Y.Doc({ gc: false }), content: '<p>First</p>' });
    await settle();
    const snap = a.storage.snapshot();
    expect(snap?.snapshot).toMatch(/^[A-Za-z0-9+/=]+$/);
    type(a.editor, ' and more');
    addParagraph(a.editor, 'Second');
    const json = a.storage.snapshotToJSON(snap as NonNullable<typeof snap>);
    const texts = json.root.children.map((c) =>
      ((c as { children?: Array<{ text?: string }> }).children ?? [])
        .map((t) => t.text ?? '')
        .join(''),
    );
    expect(texts).toEqual(['First']);
  });

  it('declines to snapshot a document that collects garbage', async () => {
    const network = new MemoryNetwork();
    const a = client(network);
    await settle();
    expect(a.storage.snapshot()).toBeNull();
  });

  it('keeps a shared list every client sees', async () => {
    const network = new MemoryNetwork();
    const a = client(network);
    const b = client(network);
    await settle();
    const listA = a.storage.sharedList<{ id: string; name: string }>('things');
    const listB = b.storage.sharedList<{ id: string; name: string }>('things');
    let heard = 0;
    const off = listB.subscribe(() => heard++);
    listA.push({ id: '1', name: 'one' });
    listA.push({ id: '2', name: 'two' });
    listA.update('1', { name: 'uno' });
    listA.remove('2');
    expect(listB.get()).toEqual([{ id: '1', name: 'uno' }]);
    expect(heard).toBe(4);
    off();
    // Not an undo step.
    expect(a.storage.canUndo.peek()).toBe(false);
  });
});

describe('BroadcastProvider', () => {
  /** An in-memory BroadcastChannel hub: async delivery to the other channels of a name. */
  function hub() {
    const channels = new Set<{
      name: string;
      onmessage: ((e: { data: unknown }) => void) | null;
    }>();
    return (name: string) => {
      const channel = {
        name,
        onmessage: null as ((e: { data: unknown }) => void) | null,
        postMessage(data: unknown) {
          for (const other of channels)
            if (other !== channel && other.name === name)
              queueMicrotask(() => other.onmessage?.({ data: structuredClone(data) }));
        },
        close() {
          channels.delete(channel);
        },
      };
      channels.add(channel);
      return channel;
    };
  }
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('syncs documents and presence between tabs, and says when it is alone', async () => {
    const channel = hub();
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.getText('t').insert(0, 'from A');
    const a = createBroadcastProvider('room', docA, { channel, syncTimeout: 20 });
    const b = createBroadcastProvider('room', docB, { channel, syncTimeout: 20 });
    const syncs: boolean[] = [];
    a.on('sync', (s) => syncs.push(s));
    a.connect();
    await wait(40);
    // Alone: synced after the timeout.
    expect(syncs).toEqual([true]);
    b.awareness.setLocalStateField('name', 'Bo');
    b.connect();
    await wait(5);
    expect(b.synced).toBe(true);
    expect(docB.getText('t').toString()).toBe('from A');
    docB.getText('t').insert(6, ' and B');
    await wait(5);
    expect(docA.getText('t').toString()).toBe('from A and B');
    expect(a.awareness.getStates().get(docB.clientID)?.name).toBe('Bo');
    b.disconnect();
    await wait(5);
    expect(a.awareness.getStates().has(docB.clientID)).toBe(false);
    expect(b.connected).toBe(false);
    a.destroy();
    b.destroy();
  });

  it('runs two editors in one page', async () => {
    const channel = hub();
    const make = (content?: string) => {
      const doc = new Y.Doc();
      const provider = createBroadcastProvider('page', doc, { channel, syncTimeout: 10 });
      const editor = createTeiEditor({
        extensions: [
          StarterKit.configure({ history: false }),
          Collaboration.configure({ doc, provider }),
        ],
        content,
      });
      editors.push(editor);
      return { editor, provider };
    };
    const a = make('<p>Shared</p>');
    await wait(30);
    const b = make('<p>Shared</p>');
    await wait(30);
    expect(paragraphs(b.editor)).toEqual(['Shared']);
    type(b.editor, '!');
    await wait(5);
    expect(a.editor.getText()).toBe('Shared!');
    a.editor.destroy();
    b.editor.destroy();
    editors.splice(0);
    a.provider.destroy();
    b.provider.destroy();
  });
});
