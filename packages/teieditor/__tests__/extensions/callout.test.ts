import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import type { TeiExtensionInput } from '../../src/core/create.js';
import { holdUi } from '../../src/core/ui-request.js';
import {
  $isCalloutNode,
  CALLOUT_VARIANTS,
  Callout,
  type CalloutStorage,
} from '../../src/extensions/callout/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(
  content: string | object,
  { markdown = false, callout = Callout as TeiExtensionInput } = {},
) {
  const editor = createTeiEditor({
    extensions: [StarterKit, callout],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** The document as `type text` lines; a callout's blocks indented under it. */
const outline = (editor: TeiEditor) =>
  editor.read(() => {
    const lines: string[] = [];
    const visit = (node: LexicalNode, pad: string) => {
      if ($isCalloutNode(node)) {
        lines.push(`${pad}callout:${node.getVariant()}`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else lines.push(`${pad}${node.getType()} ${node.getTextContent()}`.trimEnd());
    };
    for (const child of $getRoot().getChildren()) visit(child, '');
    return lines;
  });

/** The caret at `offset` in the text of the block whose text is `text`. */
const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const block = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text);
    if (block) (block as TextNode).select(offset, offset);
    else {
      // An empty block: by its index in the outline, the last empty paragraph.
      const empty = $getRoot()
        .getChildren()
        .flatMap((n) => ($isElementNode(n) && $isCalloutNode(n) ? n.getChildren() : [n]))
        .filter((n) => $isElementNode(n) && n.isEmpty())
        .at(-1);
      if ($isElementNode(empty)) empty.select();
    }
  });

const key = (
  editor: TeiEditor,
  command: typeof KEY_ENTER_COMMAND,
  init: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  let handled = false;
  editor.lexical.update(
    () => {
      handled = editor.lexical.dispatchCommand(command, event);
    },
    { discrete: true },
  );
  return { handled, prevented: event.defaultPrevented };
};

const NOTE = '<div data-tei-callout="note"><p>Read this</p></div><p>After</p>';

describe('Callout: HTML, markdown and JSON', () => {
  it('saves as <div data-tei-callout>, its icon drawn in, and reads that back', () => {
    const editor = make('<div data-tei-callout="tip"><p>One</p><ul><li>Two</li></ul></div>');
    expect(outline(editor)).toEqual(['callout:tip', '  paragraph One', '  list Two']);
    const html = editor.getHTML();
    expect(html).toMatch(
      /^<div data-tei-callout="tip" role="note"><span data-tei-callout-icon=""><svg [^>]*aria-hidden="true"[^>]*>.*<\/svg><\/span><p>One<\/p><ul><li>Two<\/li><\/ul><\/div>$/,
    );
    // The icon is not read back as content.
    expect(outline(make(html))).toEqual(outline(editor));
    expect(outline(make(editor.getJSON()))).toEqual(outline(editor));
  });

  it('reads GitHub’s alerts without their title, and bare text as a paragraph', () => {
    const editor = make(
      '<div class="markdown-alert markdown-alert-warning"><p class="markdown-alert-title">Warning</p><p>Careful</p></div><div data-tei-callout="note">Bare</div><div data-tei-callout="note"></div>',
    );
    expect(outline(editor)).toEqual([
      'callout:warning',
      '  paragraph Careful',
      'callout:note',
      '  paragraph Bare',
      'callout:note',
      '  paragraph',
    ]);
  });

  it('is a GitHub alert in markdown, its blocks quoted; a kind not installed stays a quote', () => {
    const md = '> [!TIP]\n> One\n>\n> - Two\n\nAfter';
    const editor = make(md, { markdown: true });
    expect(outline(editor)).toEqual([
      'callout:tip',
      '  paragraph One',
      '  list Two',
      'paragraph After',
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(outline(make('> [!BOGUS]\n> q', { markdown: true }))).toEqual(['quote [!BOGUS]\nq']);
  });

  it('keeps a kind it does not know, and is never empty', () => {
    const editor = make({
      root: {
        type: 'root',
        children: [{ type: 'callout', variant: 'mine', children: [], version: 1 }],
        version: 1,
      },
    });
    expect(outline(editor)).toEqual(['callout:mine', '  paragraph']);
    expect(editor.getHTML()).toMatch(
      /^<div data-tei-callout="mine" role="note"><p><br><\/p><\/div>$/,
    );
  });

  it('labels itself, in the editor’s words, with the app’s icon', () => {
    const editor = createTeiEditor({
      extensions: [StarterKit, Callout],
      content: NOTE,
      messages: { 'callout.note': 'Remarque' },
      icons: { callout: [['path', { d: 'M1 1' }]] },
    });
    editors.push(editor);
    const root = document.createElement('div');
    editor.lexical.setRootElement(root);
    const box = root.querySelector('.tei-callout');
    expect(box?.getAttribute('aria-label')).toBe('Remarque');
    expect(box?.getAttribute('role')).toBe('note');
    expect(box?.querySelector('[data-tei-callout-icon] path')?.getAttribute('d')).toBe('M1 1');
    // The text goes after the icon.
    expect(box?.lastElementChild?.textContent).toBe('Read this');
  });
});

describe('Callout: commands', () => {
  it('sets the selected blocks apart, one callout for them all', () => {
    const editor = make('<p>One</p><p>Two</p><p>Three</p>');
    editor.update(() => {
      const [one, two] = $getRoot().getAllTextNodes();
      const selection = one?.select(1, 1);
      selection?.focus.set(two?.getKey() ?? '', 1, 'text');
    });
    expect(editor.can().setCallout()).toBe(true);
    editor.commands.setCallout('warning');
    expect(outline(editor)).toEqual([
      'callout:warning',
      '  paragraph One',
      '  paragraph Two',
      'paragraph Three',
    ]);
    expect(editor.isActive('callout')).toBe(true);
    expect(editor.isActive('calloutVariant', 'warning')).toBe(true);
  });

  it('an empty line, as the slash menu leaves it: the caret goes in with it', () => {
    const editor = make('<p>Intro</p><p><br></p>');
    caret(editor, '');
    editor.commands.setCallout();
    expect(outline(editor)).toEqual(['paragraph Intro', 'callout:note', '  paragraph']);
    editor.read(() => {
      const selection = $getSelection();
      expect(
        $isRangeSelection(selection) && selection.anchor.getNode().getParent()?.getType(),
      ).toBe('callout');
    });
  });

  it('in a callout: set changes its kind, toggle takes it away, unknown kinds do nothing', () => {
    const editor = make(NOTE);
    caret(editor, 'Read this');
    editor.commands.setCallout('tip');
    expect(outline(editor)[0]).toBe('callout:tip');
    expect(editor.commands.setCalloutVariant('nope')).toBe(false);
    expect(editor.can().setCalloutVariant('nope')).toBe(false);
    expect(editor.can().setCallout('nope')).toBe(false);
    editor.commands.setCalloutVariant('caution');
    expect(outline(editor)[0]).toBe('callout:caution');
    editor.commands.toggleCallout('note');
    expect(outline(editor)[0]).toBe('callout:note');
    editor.commands.toggleCallout();
    expect(outline(editor)).toEqual(['paragraph Read this', 'paragraph After']);
    expect(editor.can().unsetCallout()).toBe(false);
  });

  it('unset keeps its blocks where it was', () => {
    const editor = make(`<p>Before</p>${NOTE}`);
    caret(editor, 'Read this', 2);
    editor.commands.unsetCallout();
    expect(outline(editor)).toEqual(['paragraph Before', 'paragraph Read this', 'paragraph After']);
  });

  it('kinds of the app’s own, in commands and markdown; the menu offers only those installed', () => {
    const mine = Callout.configure({
      variants: [
        { name: 'note', label: 'callout.note', icon: 'callout' },
        { name: 'quiz', label: 'Quiz', icon: 'lightbulb' },
      ],
    });
    const editor = make('> [!QUIZ]\n> What is 2 + 2?', { markdown: true, callout: mine });
    expect(outline(editor)[0]).toBe('callout:quiz');
    caret(editor, 'What is 2 + 2?');
    expect(editor.commands.setCalloutVariant('tip')).toBe(false);
    editor.commands.setCalloutVariant('note');
    expect(editor.getMarkdown()).toBe('> [!NOTE]\n> What is 2 + 2?');
    expect(editor.items('calloutMenu').map((i) => i.id)).toEqual(['callout-note', 'unsetCallout']);
  });

  it('openCalloutMenu needs a menu to open; it puts the caret in the callout it is for', () => {
    const editor = make(NOTE);
    caret(editor, 'After');
    const callout = editor.read(() => $getRoot().getFirstChild()?.getKey() ?? '');
    expect(editor.commands.openCalloutMenu(callout)).toBe(false);
    const storage = editor.extension(Callout)?.output.storage as CalloutStorage;
    const release = holdUi(storage.menu);
    expect(editor.can().openCalloutMenu(callout)).toBe(true);
    expect(editor.commands.openCalloutMenu(callout)).toBe(true);
    expect(storage.menuFor.peek()).toBe(callout);
    expect(storage.menu.requests.peek()).toBe(1);
    expect(editor.isActive('callout')).toBe(true);
    release();
  });
});

describe('Callout: keys and clicks', () => {
  it('Enter on an empty last line leaves the callout, with the line', () => {
    const editor = make('<div data-tei-callout="note"><p>One</p><p><br></p></div>');
    caret(editor, '');
    // Shift-Enter is a line break, where it is.
    key(editor, KEY_ENTER_COMMAND, { shiftKey: true });
    expect(outline(editor)).toEqual(['callout:note', '  paragraph One', '  paragraph']);
    const fresh = make('<div data-tei-callout="note"><p>One</p><p><br></p></div>');
    caret(fresh, '');
    expect(key(fresh, KEY_ENTER_COMMAND).prevented).toBe(true);
    expect(outline(fresh)).toEqual(['callout:note', '  paragraph One', 'paragraph']);
    // Its only line stays in: Enter makes a second one.
    const only = make('<div data-tei-callout="note"><p><br></p></div>');
    caret(only, '');
    key(only, KEY_ENTER_COMMAND);
    expect(outline(only)).toEqual(['callout:note', '  paragraph', '  paragraph']);
  });

  it('Backspace at the start of its first line takes it away; elsewhere it deletes', () => {
    const editor = make(NOTE);
    caret(editor, 'Read this', 2);
    key(editor, KEY_BACKSPACE_COMMAND);
    expect(outline(editor)[0]).toBe('callout:note');
    caret(editor, outline(editor)[1]?.slice('  paragraph '.length) ?? '', 0);
    expect(key(editor, KEY_BACKSPACE_COMMAND).prevented).toBe(true);
    expect(outline(editor)).toEqual([
      expect.stringMatching(/^paragraph Re?ad this$/),
      'paragraph After',
    ]);
  });

  it('with no menu to open, a click on its icon steps to the next kind', () => {
    const editor = make(NOTE);
    const icon = () =>
      editor.lexical.getRootElement()?.querySelector('[data-tei-callout-icon]') as Element;
    const click = () =>
      icon().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    expect(outline(editor)[0]).toBe('callout:tip');
    for (let i = 1; i < CALLOUT_VARIANTS.length; i++) click();
    expect(outline(editor)[0]).toBe('callout:note');
    // Read-only: nothing changes.
    editor.setEditable(false);
    click();
    expect(outline(editor)[0]).toBe('callout:note');
  });
});
