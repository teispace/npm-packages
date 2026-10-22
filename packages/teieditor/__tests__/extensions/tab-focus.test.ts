import { $getRoot } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import { Indent } from '../../src/extensions/alignment/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { TabFocus } from '../../src/extensions/tab-focus/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string, always = false) {
  const editor = createTeiEditor({
    extensions: [
      StarterKit,
      Indent.configure({ tabIndents: true }),
      TabFocus.configure({ always }),
    ],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  editor.update(() => $getRoot().selectEnd());
  return { editor, root };
}

/** Press a key on the root, as the browser would: Lexical hears it there. */
function press(_editor: TeiEditor, root: HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  root.dispatchEvent(event);
  return event;
}

const indent = (editor: TeiEditor) =>
  editor.read(() => {
    const block = $getRoot().getLastChild();
    return block && 'getIndent' in block ? (block.getIndent as () => number)() : 0;
  });

describe('TabFocus', () => {
  it('Tab indents where it is bound to; Escape then Tab leaves the editor instead', () => {
    const { editor, root } = make('<p>a</p>');
    const tab = press(editor, root, { key: 'Tab' });
    expect(tab.defaultPrevented).toBe(true);
    expect(indent(editor)).toBe(1);

    press(editor, root, { key: 'Escape' });
    const out = press(editor, root, { key: 'Tab' });
    // Not prevented: the browser moves focus.
    expect(out.defaultPrevented).toBe(false);
    expect(indent(editor)).toBe(1);
    // Once: the next Tab indents again.
    expect(press(editor, root, { key: 'Tab' }).defaultPrevented).toBe(true);
    expect(indent(editor)).toBe(2);

    // Shift-Tab leaves backwards the same way; another key in between disarms it.
    press(editor, root, { key: 'Escape' });
    expect(press(editor, root, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(false);
    expect(indent(editor)).toBe(2);
    press(editor, root, { key: 'Escape' });
    press(editor, root, { key: 'ArrowLeft' });
    expect(press(editor, root, { key: 'Tab' }).defaultPrevented).toBe(true);
  });

  it('with `always`, Tab never indents, lists included; switchable live', () => {
    const { editor, root } = make('<ul><li>one</li><li>two</li></ul>', true);
    expect(press(editor, root, { key: 'Tab' }).defaultPrevented).toBe(false);
    expect(editor.getHTML()).toBe('<ul><li>one</li><li>two</li></ul>');
    setExtensionOptions(editor, TabFocus, { always: false });
    expect(press(editor, root, { key: 'Tab' }).defaultPrevented).toBe(true);
    expect(editor.getHTML()).not.toBe('<ul><li>one</li><li>two</li></ul>');
  });
});
