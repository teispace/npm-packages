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
import {
  $isCollapsibleContentNode,
  $isCollapsibleNode,
  $isCollapsibleTitleNode,
  Collapsible,
} from '../../src/extensions/collapsible/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string | object, { markdown = false, editable = true } = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Collapsible],
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

/** The document as `type text` lines; a section's parts indented under it. */
const outline = (editor: TeiEditor) =>
  editor.read(() => {
    const lines: string[] = [];
    const visit = (node: LexicalNode, pad: string) => {
      if ($isCollapsibleNode(node)) {
        lines.push(`${pad}section:${node.getOpen() ? 'open' : 'closed'}`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else if ($isCollapsibleContentNode(node)) {
        lines.push(`${pad}body`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else if ($isCollapsibleTitleNode(node)) {
        lines.push(`${pad}title ${node.getTextContent()}`.trimEnd());
      } else lines.push(`${pad}${node.getType()} ${node.getTextContent()}`.trimEnd());
    };
    for (const child of $getRoot().getChildren()) visit(child, '');
    return lines;
  });

/** The caret at `offset` in the text node whose text is `text`. */
const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(offset, offset);
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
};

/** The block the caret is in, as `type text`. */
const at = (editor: TeiEditor) =>
  editor.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const node = selection.anchor.getNode();
    const block = $isElementNode(node) && !node.isInline() ? node : node.getParent();
    return block ? `${block.getType()} ${block.getTextContent()}`.trimEnd() : null;
  });

const SECTION =
  '<details open><summary>Title</summary><p>One</p><ul><li>Two</li></ul></details><p>After</p>';

describe('Collapsible: HTML, markdown and JSON', () => {
  it('saves as <details> and <summary>, and reads that back', () => {
    const editor = make(SECTION);
    const shape = [
      'section:open',
      '  title Title',
      '  body',
      '    paragraph One',
      '    list Two',
      'paragraph After',
    ];
    expect(outline(editor)).toEqual(shape);
    const html = editor.getHTML();
    expect(html).toBe(
      '<details open=""><summary>Title</summary><div data-tei-collapsible-content=""><p>One</p><ul><li>Two</li></ul></div></details><p>After</p>',
    );
    expect(outline(make(html))).toEqual(shape);
    expect(outline(make(editor.getJSON()))).toEqual(shape);
  });

  it('reads closed sections, Lexical’s, a missing summary, and an empty body', () => {
    const editor = make(
      '<details><summary>Shut</summary><div data-lexical-collapsible-content><p>In</p></div></details><details><p>No title</p></details><details><summary>Bare</summary></details>',
    );
    expect(outline(editor)).toEqual([
      'section:closed',
      '  title Shut',
      '  body',
      '    paragraph In',
      'section:closed',
      '  title',
      '  body',
      '    paragraph No title',
      'section:closed',
      '  title Bare',
      '  body',
      '    paragraph',
    ]);
  });

  it('a summary of blocks is one line', () => {
    const editor = make('<details><summary><p>A</p><p>B</p></summary><p>x</p></details>');
    expect(outline(editor).slice(0, 2)).toEqual(['section:closed', '  title A\nB']);
  });

  it('is <details> in markdown, nesting, and an unclosed one stays text', () => {
    const md =
      '<details open>\n<summary>Outer &lt;b&gt;</summary>\n\nOne\n\n<details>\n<summary>Inner</summary>\n\n- Two\n\n</details>\n\n</details>\n\nAfter';
    const editor = make(md, { markdown: true });
    expect(outline(editor)).toEqual([
      'section:open',
      '  title Outer <b>',
      '  body',
      '    paragraph One',
      '    section:closed',
      '      title Inner',
      '      body',
      '        list Two',
      'paragraph After',
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(
      outline(make('<details>\n<summary>x</summary>\n\nbody', { markdown: true })),
    ).not.toContain('section:open');
  });

  it('keeps its shape whatever JSON says', () => {
    const editor = make({
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'collapsible',
            open: false,
            version: 1,
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [{ type: 'text', text: 'loose', version: 1 }],
              },
            ],
          },
          {
            type: 'collapsible-title',
            version: 1,
            children: [{ type: 'text', text: 'stray', version: 1 }],
          },
          {
            type: 'collapsible-content',
            version: 1,
            children: [{ type: 'paragraph', version: 1, children: [] }],
          },
        ],
      },
    });
    expect(outline(editor)).toEqual([
      'section:closed',
      '  title',
      '  body',
      '    paragraph loose',
      'paragraph stray',
      'paragraph',
    ]);
  });
  it('a closed one loads closed, its body hidden until found; an empty body gets a line', () => {
    make('<details><summary>Shut</summary><p>In</p></details>');
    const body = document.querySelector('[data-tei-collapsible-content]');
    expect(body?.getAttribute('hidden')).toBe('until-found');
    const editor = make({
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'collapsible',
            open: true,
            version: 1,
            children: [
              { type: 'collapsible-title', version: 1, children: [] },
              { type: 'collapsible-content', version: 1, children: [] },
            ],
          },
        ],
      },
    });
    expect(outline(editor)).toEqual(['section:open', '  title', '  body', '    paragraph']);
  });
});

describe('Collapsible: commands', () => {
  it('turns the selected blocks into a section: the first line its title', () => {
    const editor = make('<p>Head</p><p>One</p><p>Two</p><p>Out</p>');
    editor.update(() => {
      const [head, , two] = $getRoot().getChildren();
      if ($isElementNode(head) && $isElementNode(two)) {
        const selection = head.select(0, 0);
        selection.focus.set(two.getKey(), 1, 'element');
      }
    });
    expect(editor.can().setCollapsible()).toBe(true);
    editor.commands.setCollapsible();
    expect(outline(editor)).toEqual([
      'section:open',
      '  title Head',
      '  body',
      '    paragraph One',
      '    paragraph Two',
      'paragraph Out',
    ]);
    // Already in one: not again; toggling takes it away.
    expect(editor.can().setCollapsible()).toBe(false);
    expect(editor.isActive('collapsible')).toBe(true);
    editor.commands.toggleCollapsible();
    expect(outline(editor)).toEqual([
      'paragraph Head',
      'paragraph One',
      'paragraph Two',
      'paragraph Out',
    ]);
  });

  it('opens and closes by command; closing moves the caret to the title', () => {
    const editor = make(SECTION);
    caret(editor, 'One');
    editor.commands.toggleCollapsibleOpen();
    expect(outline(editor)[0]).toBe('section:closed');
    expect(at(editor)).toBe('collapsible-title Title');
    editor.commands.setCollapsibleOpen(true);
    expect(outline(editor)[0]).toBe('section:open');
    expect(editor.can().toggleCollapsibleOpen()).toBe(true);
    caret(editor, 'After');
    expect(editor.can().toggleCollapsibleOpen()).toBe(false);
    expect(editor.commands.unsetCollapsible()).toBe(false);
  });

  it('a closed body is hidden until found, and found text opens it', () => {
    const editor = make(SECTION);
    caret(editor, 'Title');
    editor.commands.toggleCollapsibleOpen();
    const body = document.querySelector<HTMLElement>('[data-tei-collapsible-content]');
    expect(body?.getAttribute('hidden')).toBe('until-found');
    expect(document.querySelector('.tei-collapsible')?.hasAttribute('data-open')).toBe(false);
    body?.dispatchEvent(new Event('beforematch'));
    expect(outline(editor)[0]).toBe('section:open');
    expect(body?.hasAttribute('hidden')).toBe(false);
  });
});

describe('Collapsible: typing in it', () => {
  it('Enter in an open title starts the body; in a closed one, a line after it', () => {
    const editor = make(SECTION);
    caret(editor, 'Title');
    key(editor, KEY_ENTER_COMMAND);
    expect(outline(editor).slice(0, 4)).toEqual([
      'section:open',
      '  title Title',
      '  body',
      '    paragraph',
    ]);
    editor.commands.setCollapsibleOpen(false);
    caret(editor, 'Title');
    key(editor, KEY_ENTER_COMMAND);
    expect(outline(editor).at(-2)).toBe('paragraph');
    expect(at(editor)).toBe('paragraph');
  });

  it('Enter in the title of a new section goes to its one empty line', () => {
    const editor = make('<p>Head</p>');
    caret(editor, 'Head');
    editor.commands.setCollapsible();
    key(editor, KEY_ENTER_COMMAND);
    expect(outline(editor)).toEqual(['section:open', '  title Head', '  body', '    paragraph']);
    expect(at(editor)).toBe('paragraph');
  });

  it('Enter on an empty last line of the body steps out of it', () => {
    const editor = make('<details open><summary>T</summary><p>One</p></details>');
    caret(editor, 'One');
    key(editor, KEY_ENTER_COMMAND);
    key(editor, KEY_ENTER_COMMAND);
    expect(outline(editor)).toEqual([
      'section:open',
      '  title T',
      '  body',
      '    paragraph One',
      'paragraph',
    ]);
  });

  it('Backspace at the start of the title takes the section away, keeping its text', () => {
    const editor = make(SECTION);
    // Elsewhere in the title it is an ordinary Backspace: the section stays.
    caret(editor, 'Title', 2);
    key(editor, KEY_BACKSPACE_COMMAND);
    expect(outline(editor).slice(0, 2)).toEqual(['section:open', '  title Title']);
    editor.setContent(SECTION);
    caret(editor, 'Title', 0);
    key(editor, KEY_BACKSPACE_COMMAND);
    expect(outline(editor)).toEqual([
      'paragraph Title',
      'paragraph One',
      'list Two',
      'paragraph After',
    ]);
    expect(at(editor)).toBe('paragraph Title');
  });

  it('clicking the chevron opens and closes it; read-only, only the view', () => {
    const editor = make(SECTION);
    const toggle = () => document.querySelector('[data-tei-collapsible-toggle]') as HTMLElement;
    expect(toggle().querySelector('svg')).not.toBeNull();
    toggle().click();
    expect(outline(editor)[0]).toBe('section:closed');
    toggle().click();
    expect(outline(editor)[0]).toBe('section:open');

    const reader = make(SECTION, { editable: false });
    const box = reader.lexical.getRootElement()?.querySelector('.tei-collapsible') as HTMLElement;
    (box.querySelector('[data-tei-collapsible-toggle]') as HTMLElement).click();
    expect(box.hasAttribute('data-open')).toBe(false);
    expect(outline(reader)[0]).toBe('section:open');
  });
});
