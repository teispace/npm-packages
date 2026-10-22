import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  DELETE_CHARACTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
} from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  $isSpecialTextNode,
  SpecialText,
  type SpecialTextOptions,
} from '../../src/extensions/special-text/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function make(content = '<p></p>', options: Partial<SpecialTextOptions> = {}, markdown = false) {
  const editor = createTeiEditor({
    extensions: [StarterKit, SpecialText.configure(options)],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  editor.update(() => $getRoot().selectEnd());
  return editor;
}

/** Type each character as its own update, as keys do. */
const type = (editor: TeiEditor, text: string) => {
  for (const char of text) {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(char);
    });
  }
};

const press = (editor: TeiEditor, command: typeof KEY_BACKSPACE_COMMAND) => {
  const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
  let handled = false;
  editor.lexical.update(
    () => {
      handled = editor.lexical.dispatchCommand(command, event);
    },
    { discrete: true },
  );
  return { handled, prevented: event.defaultPrevented };
};

describe('SpecialText: replacements as you type', () => {
  it.each([
    ['a--', 'a—'],
    ['a -- b', 'a — b'],
    ['wait...', 'wait…'],
    ['(c) (C) (r) (tm) (TM)', '© © ® ™ ™'],
    ['a -> b <- c', 'a → b ← c'],
    ['1/2 3/4, 1/4.', '½ ¾, ¼.'],
    ['11/2 1/20 ', '11/2 1/20 '],
    ['"Hi," she said, "it\'s \'odd\'."', '“Hi,” she said, “it’s ‘odd’.”'],
    ['(\'a\') ["b"]', '(‘a’) [“b”]'],
  ])('%s → %s', (typed, result) => {
    const editor = make();
    type(editor, typed);
    expect(editor.getText()).toBe(result);
  });

  it('leaves `--` at the start of a line, where `---` is a markdown rule', () => {
    const editor = make();
    type(editor, '--');
    expect(editor.getText()).toBe('--');
  });

  it('each is one undo step, and Backspace straight after takes it back', () => {
    const editor = make();
    type(editor, 'a--');
    expect(editor.getText()).toBe('a—');
    editor.commands.undo();
    expect(editor.getText()).toBe('a--');

    // A quote is as long as what it replaces: still its own step.
    const quoted = make();
    type(quoted, 'a "');
    expect(quoted.getText()).toBe('a “');
    quoted.commands.undo();
    expect(quoted.getText()).toBe('a "');

    const other = make();
    type(other, 'x(c)');
    expect(other.getText()).toBe('x©');
    expect(press(other, KEY_BACKSPACE_COMMAND)).toEqual({ handled: true, prevented: true });
    expect(other.getText()).toBe('x(c)');
    // Only straight after: a second is an ordinary one (jsdom deletes nothing).
    press(other, KEY_BACKSPACE_COMMAND);
    expect(other.getText()).toBe('x(c)');
  });

  it('Backspace after the caret moved, or after more typing, is ordinary', () => {
    const editor = make();
    type(editor, 'a...b');
    expect(editor.getText()).toBe('a…b');
    press(editor, KEY_BACKSPACE_COMMAND);
    expect(editor.getText()).toBe('a…b');
    const moved = make();
    type(moved, 'a...');
    moved.update(() => $getRoot().selectStart());
    press(moved, KEY_BACKSPACE_COMMAND);
    expect(moved.getText()).toBe('a…');
  });

  it('takes a replacement back on Android’s delete, with no Backspace key', () => {
    const editor = make();
    type(editor, 'x->');
    editor.lexical.update(
      () => {
        editor.lexical.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      { discrete: true },
    );
    expect(editor.getText()).toBe('x->');
  });

  it('never in a code block, inline code, or during composition', () => {
    const block = make('<pre><code>x</code></pre>');
    type(block, '--...');
    expect(block.getText()).toBe('x--...');

    const inline = make('<p><code>xy</code></p>');
    // In the code, as a click puts the caret there.
    inline.update(() => $getRoot().getAllTextNodes()[0]?.select(1, 1));
    for (const char of '(c)') {
      inline.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        selection.format = 16; // code
        selection.insertText(char);
      });
    }
    expect(inline.getText()).toBe('x(c)y');

    const composing = make();
    vi.spyOn(composing.lexical, 'isComposing').mockReturnValue(true);
    type(composing, 'a--');
    expect(composing.getText()).toBe('a--');
  });

  it('never on paste or loaded content', () => {
    const editor = make('<p>a -- b (c)...</p>');
    expect(editor.getText()).toBe('a -- b (c)...');
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText('x -- (c)');
    });
    expect(editor.getText()).toBe('a -- b (c)...x -- (c)');
  });

  it('replacements configure by name, and quotes by language', () => {
    const editor = make('<p></p>', {
      replacements: { oneHalf: null, plusMinus: { match: '+-', replace: '±' } },
      quotes: { double: ['„', '“'], single: ['‚', '‘'] },
    });
    type(editor, '1/2 +- "ja" a--');
    expect(editor.getText()).toBe('1/2 ± „ja“ a—');
    setExtensionOptions(editor, SpecialText, { quotes: null });
    type(editor, ' "x"');
    expect(editor.getText()).toBe('1/2 ± „ja“ a— "x"');
  });
});

describe('SpecialText: [bracketed] text', () => {
  it('off by default', () => {
    const editor = make();
    type(editor, 'a [b]');
    expect(editor.getText()).toBe('a [b]');
  });

  it('becomes special text after its `]`, saved without the brackets; Backspace gives them back', () => {
    const editor = make('<p></p>', { brackets: true });
    type(editor, 'see [note] here');
    expect(editor.getText()).toBe('see note here');
    const special = editor.read(() =>
      $getRoot().getAllTextNodes().find($isSpecialTextNode)?.getTextContent(),
    );
    expect(special).toBe('note');
    const dom = editor.lexical.getRootElement()?.querySelector('.tei-special-text');
    expect(dom?.textContent).toBe('note');
    expect(editor.getHTML()).toBe('<p>see <span data-tei-special-text="">note</span> here</p>');
    expect(editor.getMarkdown()).toBe('see [note] here');

    const other = make('<p></p>', { brackets: true });
    // (`[x] ` at a line's start is a markdown to-do.)
    type(other, 'a [x] ');
    expect(other.getText()).toBe('a x ');
    expect(press(other, KEY_BACKSPACE_COMMAND).handled).toBe(true);
    expect(other.getText()).toBe('a [x] ');
    // The caret is back after the space: typing goes on from there.
    type(other, 'y');
    expect(other.getText()).toBe('a [x] y');
    expect(other.read(() => $getRoot().getAllTextNodes().some($isSpecialTextNode))).toBe(false);
  });

  it('not a link, a reference or an image', () => {
    const editor = make('<p></p>', { brackets: true });
    type(editor, '![a] [b](');
    expect(editor.getText()).toBe('![a] [b](');
  });

  it('reads back from HTML, markdown (only while on) and JSON', () => {
    const html = '<p>a <span data-tei-special-text=""><strong>b</strong></span></p>';
    const editor = make(html, { brackets: true });
    const found = editor.read(() => {
      const node = $getRoot().getAllTextNodes().find($isSpecialTextNode);
      return node && [node.getTextContent(), node.hasFormat('bold')];
    });
    expect(found).toEqual(['b', true]);
    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"special-text"');
    expect(make(json).read(() => $getRoot().getAllTextNodes().some($isSpecialTextNode))).toBe(true);
    const md = make('x [y]\n\n[z](https://e.com)', { brackets: true }, true);
    expect(md.read(() => $getRoot().getAllTextNodes().filter($isSpecialTextNode).length)).toBe(1);
    expect(md.getMarkdown()).toBe('x [y]\n\n[z](https://e.com)');
    const off = make('x [y]', {}, true);
    expect(off.read(() => $getRoot().getAllTextNodes().some($isSpecialTextNode))).toBe(false);
    expect(off.getText()).toBe('x [y]');
  });
});
