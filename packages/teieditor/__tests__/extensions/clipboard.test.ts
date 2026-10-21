import { $getRoot, $isElementNode, type TextNode } from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clipboard, readClipboard } from '../../src/extensions/clipboard/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

/** jsdom has no DataTransfer or ClipboardEvent: as much of each as a paste reads. */
class TestDataTransfer {
  readonly #data = new Map<string, string>();
  readonly files: File[] = [];
  readonly items = { add: (file: File) => this.files.push(file) };
  get types() {
    return [...this.#data.keys(), ...(this.files.length > 0 ? ['Files'] : [])];
  }
  setData(type: string, value: string) {
    this.#data.set(type, value);
  }
  getData(type: string) {
    return this.#data.get(type) ?? '';
  }
}
/** Like Safari's: the constructor leaves `clipboardData` out. */
class TestClipboardEvent extends Event {
  readonly clipboardData: DataTransfer | null = null;
}
beforeEach(() => {
  vi.stubGlobal('DataTransfer', TestDataTransfer);
  vi.stubGlobal('ClipboardEvent', TestClipboardEvent);
  // Lexical tells a paste from a drop by class.
  if (typeof DragEvent === 'undefined') vi.stubGlobal('DragEvent', class extends Event {});
});

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function make(content = '<p>Hello world</p>') {
  const editor = createTeiEditor({ extensions: [StarterKit], content });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** Select `[from, to)` of the first paragraph's text. */
const select = (editor: TeiEditor, from: number, to: number) =>
  editor.update(() => {
    const paragraph = $getRoot().getFirstChild();
    if ($isElementNode(paragraph)) (paragraph.getFirstChild() as TextNode).select(from, to);
  });

describe('Clipboard', () => {
  it('comes with StarterKit, its items in the context menu, with the keys they mean', () => {
    const editor = make();
    expect(editor.extension(Clipboard)).toBeDefined();
    expect(
      editor
        .items('contextMenu')
        .filter((i) => i.group === 'clipboard')
        .map((i) => i.id),
    ).toEqual(['cut', 'copy', 'paste', 'pastePlain']);
    const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
    expect(editor.shortcut('cut')).toEqual([mod, 'X']);
    expect(editor.shortcut('pastePlain')?.at(-1)).toBe('V');
  });

  it('cut and copy need something selected; cut and paste, an editable editor', () => {
    const editor = make();
    select(editor, 2, 2);
    expect(editor.can().copy()).toBe(false);
    expect(editor.can().cut()).toBe(false);
    expect(editor.can().paste()).toBe(true);
    select(editor, 0, 5);
    expect(editor.can().copy()).toBe(true);
    expect(editor.can().cut()).toBe(true);
    editor.setEditable(false);
    expect(editor.can().copy()).toBe(true);
    expect(editor.can().cut()).toBe(false);
    expect(editor.can().paste()).toBe(false);
    expect(editor.can().pastePlain()).toBe(false);
  });

  it('leaves the keys to the browser: its own cut, copy and paste run', () => {
    const editor = make();
    select(editor, 0, 5);
    for (const key of ['c', 'x', 'v']) {
      const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: !navigator.platform.startsWith('Mac'),
        metaKey: navigator.platform.startsWith('Mac'),
        bubbles: true,
        cancelable: true,
      });
      editor.lexical.getRootElement()?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('pastes what its reader gives, through the editor’s own paste', async () => {
    const editor = make();
    select(editor, 5, 11);
    const plain = vi.fn<(plain: boolean) => Promise<DataTransfer | null>>(async () => {
      const data = new DataTransfer();
      data.setData('text/plain', ' there');
      return data;
    });
    setExtensionOptions(editor, Clipboard, { read: plain });
    expect(editor.commands.pastePlain()).toBe(true);
    await vi.waitFor(() => expect(editor.getText()).toBe('Hello there'));
    expect(plain).toHaveBeenCalledWith(true);
  });

  it('says so when the browser will not give the clipboard', async () => {
    const editor = make();
    select(editor, 0, 0);
    setExtensionOptions(editor, Clipboard, { read: async () => null });
    editor.commands.paste();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-tei-live]')?.textContent).toMatch(/would not let/),
    );
    expect(editor.getText()).toBe('Hello world');
  });

  it('reads the Clipboard API: html, text and images; nothing when refused', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const items = [
      {
        types: ['text/html', 'text/plain', 'image/png', 'application/json'],
        getType: async (type: string) =>
          type === 'image/png' ? png : new Blob([type === 'text/html' ? '<b>Hi</b>' : 'Hi']),
      },
    ];
    vi.stubGlobal('navigator', {
      clipboard: { read: async () => items, readText: async () => 'Just text' },
    });
    const rich = await readClipboard(false);
    expect(rich?.getData('text/html')).toBe('<b>Hi</b>');
    expect(rich?.getData('text/plain')).toBe('Hi');
    expect(rich?.files[0]?.type).toBe('image/png');
    expect(rich?.types).not.toContain('application/json');
    const plain = await readClipboard(true);
    expect(plain?.getData('text/plain')).toBe('Just text');
    expect(plain?.getData('text/html')).toBe('');
    vi.stubGlobal('navigator', {
      clipboard: { read: () => Promise.reject(new Error('NotAllowedError')) },
    });
    expect(await readClipboard(false)).toBeNull();
    vi.stubGlobal('navigator', {});
    expect(await readClipboard(false)).toBeNull();
  });
});
