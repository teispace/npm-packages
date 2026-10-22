import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  getTreeViewStorage,
  indentHTML,
  printNodeTree,
  TreeView,
  type TreeViewOptions,
  type TreeViewStorage,
} from '../../src/extensions/tree-view/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(options: Partial<TreeViewOptions> = {}, content = '<p>One</p>') {
  const editor = createTeiEditor({
    extensions: [StarterKit, TreeView.configure(options)],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  const storage = getTreeViewStorage(editor) as TreeViewStorage;
  return { editor, storage };
}

/** Add a paragraph, as its own undo step. */
const add = (editor: TeiEditor, text: string) =>
  editor.update(() => {
    $getRoot().append($createParagraphNode().append($createTextNode(text)));
  });

describe('TreeView (the extension)', () => {
  it('records every state, oldest first, up to maxStates', () => {
    const { editor, storage } = make({ maxStates: 4 });
    const start = storage.history.value.length;
    expect(start).toBeGreaterThan(0);
    add(editor, 'Two');
    add(editor, 'Three');
    const history = storage.history.value;
    expect(history[history.length - 1]?.state).toBe(editor.lexical.getEditorState());
    expect(history[history.length - 1]?.docChanged).toBe(true);
    for (const word of ['Four', 'Five', 'Six']) add(editor, word);
    expect(storage.history.value).toHaveLength(4);
    const times = storage.history.value.map((e) => e.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('travels back read-only, records nothing meanwhile, and comes back', () => {
    const { editor, storage } = make();
    add(editor, 'Two');
    add(editor, 'Three');
    const length = storage.history.value.length;
    const first = storage.history.value.findIndex((e) =>
      e.state.read(() => $getRoot().getTextContent() === 'One'),
    );
    expect(storage.travelTo(first)).toBe(true);
    expect(editor.getText()).toBe('One');
    expect(editor.isEditable).toBe(false);
    expect(storage.travelling.value).toBe(first);
    storage.travelTo(length - 1);
    expect(editor.getText()).toBe('One\n\nTwo\n\nThree');
    expect(storage.history.value).toHaveLength(length);
    storage.exitTimeTravel();
    expect(storage.travelling.value).toBeNull();
    expect(editor.isEditable).toBe(true);
    expect(editor.getText()).toBe('One\n\nTwo\n\nThree');
    // Recording again.
    add(editor, 'Four');
    expect(storage.history.value).toHaveLength(length + 1);
  });

  it('leaves undo history as it was', () => {
    const { editor, storage } = make();
    add(editor, 'Two');
    storage.travelTo(0);
    storage.travelTo(1);
    storage.exitTimeTravel();
    expect(editor.can().undo()).toBe(true);
    editor.commands.undo();
    expect(editor.getText()).toBe('One');
    editor.commands.redo();
    expect(editor.getText()).toBe('One\n\nTwo');
  });

  it('keeps a read-only editor read-only after travelling', () => {
    const { editor, storage } = make();
    add(editor, 'Two');
    editor.setEditable(false);
    storage.travelTo(0);
    storage.exitTimeTravel();
    expect(editor.isEditable).toBe(false);
  });

  it('ignores travel to a state it does not have', () => {
    const { editor, storage } = make();
    expect(storage.travelTo(-1)).toBe(false);
    expect(storage.travelTo(9_999)).toBe(false);
    expect(storage.travelTo(Number.NaN)).toBe(false);
    expect(storage.travelling.value).toBeNull();
    expect(editor.isEditable).toBe(true);
    storage.exitTimeTravel();
    expect(editor.isEditable).toBe(true);
  });

  it('clears its history, but not while travelling', () => {
    const { editor, storage } = make();
    add(editor, 'Two');
    storage.travelTo(0);
    storage.clearHistory();
    expect(storage.history.value.length).toBeGreaterThan(0);
    storage.exitTimeTravel();
    storage.clearHistory();
    expect(storage.history.value).toEqual([]);
  });

  it('opens and closes the panel, from the document menu', async () => {
    const { editor, storage } = make();
    expect(editor.isActive('treeView')).toBe(false);
    editor.commands.toggleTreeView();
    expect(editor.isActive('treeView')).toBe(true);
    expect(editor.items('document').map((i) => i.id)).toContain('treeView');
    // Closed while travelling: back to now.
    add(editor, 'Two');
    storage.travelTo(0);
    editor.commands.toggleTreeView();
    expect(editor.isActive('treeView')).toBe(false);
    await Promise.resolve();
    expect(storage.travelling.value).toBeNull();
    expect(editor.getText()).toBe('One\n\nTwo');
    expect(editor.isEditable).toBe(true);
  });

  it('prints the tree with the selection, the JSON and the saved HTML', async () => {
    const { editor } = make({}, '<p>One <strong>bold</strong></p><ul><li>Item</li></ul>');
    editor.update(() => $getRoot().selectEnd());
    const tree = await printNodeTree(editor);
    expect(tree).toContain('root');
    expect(tree).toMatch(/paragraph/);
    expect(tree).toContain('"bold"');
    expect(tree).toContain('selection: range');
    expect(JSON.parse(await printNodeTree(editor, 'json'))).toEqual(editor.getJSON());
    const html = await printNodeTree(editor, 'html');
    expect(html).toBe('<p>One <strong>bold</strong></p>\n<ul>\n  <li>Item</li>\n</ul>');
  });

  it('declares itself by its directory name', () => {
    expect(TreeView.name).toBe('@teispace/teieditor/tree-view');
  });
});

describe('indentHTML', () => {
  it('puts each block on a line, indented, and leaves inline content and <pre> alone', () => {
    expect(
      indentHTML(
        '<blockquote><p>a <em>b</em></p><p>c</p></blockquote><pre><code>x\n  y</code></pre><hr>',
      ),
    ).toBe(
      [
        '<blockquote>',
        '  <p>a <em>b</em></p>',
        '  <p>c</p>',
        '</blockquote>',
        '<pre><code>x\n  y</code></pre>',
        '<hr>',
      ].join('\n'),
    );
    expect(indentHTML('')).toBe('');
    expect(indentHTML('just text')).toBe('just text');
  });

  it('runs nothing in the HTML it is given', async () => {
    const w = window as unknown as { pwned?: boolean };
    const out = indentHTML(
      '<div><img src="x" onerror="window.pwned = true"><script>window.pwned = true</script><p>ok</p></div>',
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(w.pwned).toBeUndefined();
    expect(out).toContain('<p>ok</p>');
  });
});
