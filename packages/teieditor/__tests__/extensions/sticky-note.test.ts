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
import { holdUi } from '../../src/core/ui-request.js';
import { Card } from '../../src/extensions/card/index.js';
import { Image } from '../../src/extensions/image/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  $isStickyNoteNode,
  STICKY_COLORS,
  StickyNote,
  type StickyNoteStorage,
} from '../../src/extensions/sticky-note/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string | object, { markdown = false, editable = true } = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, StickyNote, Card, Image],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
    editable,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = String(editable);
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** The document as `type text` lines; a note's blocks indented under it. */
const outline = (editor: TeiEditor) =>
  editor.read(() => {
    const lines: string[] = [];
    const visit = (node: LexicalNode, pad: string) => {
      if ($isStickyNoteNode(node)) {
        lines.push(`${pad}sticky:${node.getColor()}`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else if (node.getType() === 'card' && $isElementNode(node)) {
        lines.push(`${pad}card`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else lines.push(`${pad}${node.getType()} ${node.getTextContent()}`.trimEnd());
    };
    for (const child of $getRoot().getChildren()) visit(child, '');
    return lines;
  });

const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text);
    if (node) (node as TextNode).select(offset, offset);
    else {
      const empty: LexicalNode[] = [];
      const walk = (n: LexicalNode) => {
        if ($isElementNode(n)) {
          if (n.isEmpty() && !$isStickyNoteNode(n)) empty.push(n);
          n.getChildren().forEach(walk);
        }
      };
      walk($getRoot());
      const last = empty.at(-1);
      if ($isElementNode(last)) last.select();
    }
  });

const key = (
  editor: TeiEditor,
  command: typeof KEY_ENTER_COMMAND,
  init: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  editor.lexical.update(
    () => {
      editor.lexical.dispatchCommand(command, event);
    },
    { discrete: true },
  );
  return { prevented: event.defaultPrevented };
};

const NOTE =
  '<aside data-tei-sticky="pink"><p>Call Sam</p><ul><li>milk</li></ul></aside><p>After</p>';
const dom = (editor: TeiEditor) =>
  editor.lexical.getRootElement()?.querySelector('.tei-sticky') as HTMLElement;

describe('Sticky note: HTML, markdown and JSON', () => {
  it('saves as <aside data-tei-sticky>, without its swatch, and reads that back', () => {
    const editor = make(NOTE);
    const shape = ['sticky:pink', '  paragraph Call Sam', '  list milk', 'paragraph After'];
    expect(outline(editor)).toEqual(shape);
    const html = editor.getHTML();
    expect(html).toBe(
      '<aside data-tei-sticky="pink" role="note"><p>Call Sam</p><ul><li>milk</li></ul></aside><p>After</p>',
    );
    expect(outline(make(html))).toEqual(shape);
    expect(outline(make(editor.getJSON()))).toEqual(shape);
  });

  it('draws a labelled note, its swatch a button before the lines, not content', () => {
    const editor = make(NOTE);
    const note = dom(editor);
    expect(note.tagName).toBe('ASIDE');
    expect(note.getAttribute('role')).toBe('note');
    expect(note.getAttribute('aria-label')).toBe('Sticky note');
    expect(note.getAttribute('data-color')).toBe('pink');
    const swatch = note.firstElementChild;
    expect(swatch?.getAttribute('data-tei-sticky-swatch')).toBe('');
    expect(swatch?.getAttribute('contenteditable')).toBe('false');
    expect(swatch?.getAttribute('role')).toBe('button');
    expect(swatch?.getAttribute('aria-label')).toBe('Note colour');
    expect(note.lastElementChild?.textContent).toBe('milk');
    expect(editor.getText()).not.toContain('Note colour');
  });

  it('hostile colours never reach an attribute: anything unknown is yellow', () => {
    const editor = make('<aside data-tei-sticky="red; background:url(x)"><p>a</p></aside>');
    expect(outline(editor)[0]).toBe('sticky:yellow');
    expect(dom(editor).getAttribute('data-color')).toBe('yellow');
    expect(editor.getHTML()).toBe('<aside data-tei-sticky="yellow" role="note"><p>a</p></aside>');
    const json = make({
      root: {
        type: 'root',
        version: 1,
        children: [{ type: 'sticky-note', color: '"><img>', children: [], version: 1 }],
      },
    });
    expect(outline(json)).toEqual(['sticky:yellow', '  paragraph']);
    expect(editor.commands.setStickyColor('orange' as never)).toBe(false);
    // Other asides are not notes.
    expect(outline(make('<aside><p>plain</p></aside>'))[0]).not.toMatch(/^sticky/);
  });

  it('is an HTML-comment fence in markdown; unknown words give yellow', () => {
    const md = '<!-- sticky green -->\n\nBuy\n\n- eggs\n\n<!-- /sticky -->\n\nAfter';
    const editor = make(md, { markdown: true });
    expect(outline(editor)).toEqual([
      'sticky:green',
      '  paragraph Buy',
      '  list eggs',
      'paragraph After',
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(outline(make('<!-- sticky teal -->\nx\n<!-- /sticky -->', { markdown: true }))).toEqual([
      'sticky:yellow',
      '  paragraph x',
    ]);
    // In a card, both fences nest.
    const both = make(
      '<!-- card -->\n\n<!-- sticky blue -->\n\nhi\n\n<!-- /sticky -->\n\n<!-- /card -->',
      { markdown: true },
    );
    expect(outline(both)).toEqual(['card', '  sticky:blue', '    paragraph hi']);
    expect(outline(make(both.getMarkdown(), { markdown: true }))).toEqual(outline(both));
  });
});

describe('Sticky note: holds lines and lists only', () => {
  it('a heading or quote becomes a line of its text; code gives its text; an image goes after', () => {
    const editor = make(
      '<aside data-tei-sticky="blue"><h2>Title <b>bold</b></h2><blockquote>q</blockquote><pre><code>a\nb</code></pre><p><img src="https://example.com/a.png" alt="x"></p><p>end</p></aside><p>After</p>',
    );
    expect(outline(editor)).toEqual([
      'sticky:blue',
      '  paragraph Title bold',
      '  paragraph q',
      '  paragraph a\nb',
      '  paragraph end',
      'image',
      'paragraph After',
    ]);
    // Bold survived the move; the image follows the note.
    expect(editor.getHTML()).toBe(
      '<aside data-tei-sticky="blue" role="note"><p>Title <strong>bold</strong></p><p>q</p><p>a<br>b</p><p>end</p></aside><img src="https://example.com/a.png" alt="x"><p>After</p>',
    );
  });

  it('a note or card put in a note goes on after it', () => {
    const editor = make({
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'sticky-note',
            color: 'pink',
            version: 1,
            children: [
              { type: 'paragraph', version: 1, children: [] },
              {
                type: 'sticky-note',
                color: 'green',
                version: 1,
                children: [{ type: 'paragraph', version: 1, children: [] }],
              },
              {
                type: 'card',
                variant: 'default',
                accent: null,
                version: 1,
                children: [{ type: 'paragraph', version: 1, children: [] }],
              },
            ],
          },
        ],
      },
    });
    expect(outline(editor)).toEqual([
      'sticky:pink',
      '  paragraph',
      'sticky:green',
      '  paragraph',
      'card',
      '  paragraph',
    ]);
  });
});

describe('Sticky note: commands', () => {
  it('insertStickyNote: the slash menu’s empty line becomes the note, the caret in it', () => {
    const editor = make('<p>Intro</p><p><br></p>');
    caret(editor, '');
    expect(editor.can().insertStickyNote()).toBe(true);
    editor.commands.insertStickyNote('purple');
    expect(outline(editor)).toEqual(['paragraph Intro', 'sticky:purple', '  paragraph']);
    expect(editor.isActive('stickyNote')).toBe(true);
    expect(editor.isActive('stickyColor', 'purple')).toBe(true);
    editor.read(() => {
      const selection = $getSelection();
      expect(
        $isStickyNoteNode(
          $isRangeSelection(selection) ? selection.anchor.getNode().getParent() : null,
        ),
      ).toBe(true);
    });
    // Not inside one already, and not with a colour it does not have.
    expect(editor.can().insertStickyNote()).toBe(false);
    expect(editor.commands.insertStickyNote()).toBe(false);
    caret(editor, 'Intro');
    expect(editor.can().insertStickyNote('teal' as never)).toBe(false);
    expect(editor.commands.insertStickyNote('teal' as never)).toBe(false);
  });

  it('turns the selected lines into a note; set colour; remove keeps the lines', () => {
    const editor = make('<p>One</p><p>Two</p><p>Three</p>');
    editor.update(() => {
      const [one, two] = $getRoot().getAllTextNodes();
      const selection = one?.select(0, 0);
      selection?.focus.set(two?.getKey() ?? '', 1, 'text');
    });
    editor.commands.insertStickyNote();
    expect(outline(editor)).toEqual([
      'sticky:yellow',
      '  paragraph One',
      '  paragraph Two',
      'paragraph Three',
    ]);
    expect(editor.can().setStickyColor('green')).toBe(true);
    editor.commands.setStickyColor('green');
    expect(dom(editor).getAttribute('data-color')).toBe('green');
    expect(editor.can().removeStickyNote()).toBe(true);
    editor.commands.removeStickyNote();
    expect(outline(editor)).toEqual(['paragraph One', 'paragraph Two', 'paragraph Three']);
    expect(editor.can().removeStickyNote()).toBe(false);
    expect(editor.can().setStickyColor('green')).toBe(false);
  });

  it('by key, from outside the note', () => {
    const editor = make(NOTE);
    caret(editor, 'After');
    const note = editor.read(() => $getRoot().getFirstChild()?.getKey() ?? '');
    expect(editor.isActive('stickyNote')).toBe(false);
    editor.commands.setStickyColor('blue', note);
    expect(outline(editor)[0]).toBe('sticky:blue');
    editor.commands.removeStickyNote(note);
    expect(outline(editor)[0]).toBe('paragraph Call Sam');
  });

  it('openStickyMenu needs a menu to open; it puts the caret in the note it is for', () => {
    const editor = make(NOTE);
    caret(editor, 'After');
    const note = editor.read(() => $getRoot().getFirstChild()?.getKey() ?? '');
    expect(editor.commands.openStickyMenu(note)).toBe(false);
    const storage = editor.extension(StickyNote)?.output.storage as StickyNoteStorage;
    const release = holdUi(storage.menu);
    expect(editor.can().openStickyMenu(note)).toBe(true);
    expect(editor.commands.openStickyMenu(note)).toBe(true);
    expect(storage.menuFor.peek()).toBe(note);
    expect(storage.menu.requests.peek()).toBe(1);
    expect(editor.isActive('stickyNote')).toBe(true);
    release();
  });

  it('offers its colours and removal in its menu', () => {
    const editor = make(NOTE);
    expect(editor.items('stickyMenu').map((i) => i.id)).toEqual([
      ...STICKY_COLORS.map((c) => `sticky-${c}`),
      'removeStickyNote',
    ]);
    expect(editor.items('slash').some((i) => i.id === 'stickyNote')).toBe(true);
  });
});

describe('Sticky note: keys and clicks', () => {
  it('Enter on an empty last line leaves the note', () => {
    const editor = make('<aside data-tei-sticky="yellow"><p>One</p><p><br></p></aside>');
    caret(editor, '');
    expect(key(editor, KEY_ENTER_COMMAND).prevented).toBe(true);
    expect(outline(editor)).toEqual(['sticky:yellow', '  paragraph One', 'paragraph']);
  });

  it('Backspace at the start of its first line takes it away, keeping the lines', () => {
    const editor = make(NOTE);
    caret(editor, 'Call Sam', 0);
    expect(key(editor, KEY_BACKSPACE_COMMAND).prevented).toBe(true);
    expect(outline(editor)).toEqual(['paragraph Call Sam', 'list milk', 'paragraph After']);
  });

  it('with no menu to open, a click on its swatch steps to the next colour; read-only, nothing', () => {
    const editor = make('<aside data-tei-sticky="yellow"><p>x</p></aside>');
    const click = () =>
      dom(editor)
        .querySelector('[data-tei-sticky-swatch]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    expect(outline(editor)[0]).toBe('sticky:pink');
    for (let i = 1; i < STICKY_COLORS.length; i++) click();
    expect(outline(editor)[0]).toBe('sticky:yellow');
    editor.setEditable(false);
    click();
    expect(outline(editor)[0]).toBe('sticky:yellow');
  });

  it('a click on the swatch with a menu mounted asks the menu', () => {
    const editor = make(NOTE);
    const storage = editor.extension(StickyNote)?.output.storage as StickyNoteStorage;
    const release = holdUi(storage.menu);
    dom(editor)
      .querySelector('[data-tei-sticky-swatch]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(storage.menu.requests.peek()).toBe(1);
    expect(outline(editor)[0]).toBe('sticky:pink');
    release();
  });
});
