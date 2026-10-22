import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalCommand,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { Callout } from '../../src/extensions/callout/index.js';
import {
  $createColumns,
  $isColumnNode,
  $isColumnsNode,
  Columns,
  parseColumnsLayout,
} from '../../src/extensions/columns/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string | object, { markdown = false, editable = true } = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Columns, Callout],
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

/** The document as `type text` lines; columns and their blocks indented. */
const outline = (editor: TeiEditor) =>
  editor.read(() => {
    const lines: string[] = [];
    const visit = (node: LexicalNode, pad: string) => {
      if ($isColumnsNode(node)) {
        lines.push(`${pad}columns ${node.getLayout().join(':')}`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else if ($isColumnNode(node)) {
        lines.push(`${pad}column`);
        for (const child of node.getChildren()) visit(child, `${pad}  `);
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
  command: LexicalCommand<KeyboardEvent>,
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
  return handled;
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

const TWO =
  '<div data-tei-columns="1fr 2fr"><div data-tei-column="1"><p>A</p><ul><li>B</li></ul></div><div data-tei-column="2"><p>C</p></div></div><p>After</p>';
const TWO_SHAPE = [
  'columns 1:2',
  '  column',
  '    paragraph A',
  '    list B',
  '  column',
  '    paragraph C',
  'paragraph After',
];

describe('parseColumnsLayout', () => {
  it('reads arrays and track lists, rounds and caps shares, refuses the rest', () => {
    expect(parseColumnsLayout([1, 2])).toEqual([1, 2]);
    expect(parseColumnsLayout('1fr 2fr 1fr')).toEqual([1, 2, 1]);
    expect(parseColumnsLayout('repeat(4, 1fr)')).toEqual([1, 1, 1, 1]);
    expect(parseColumnsLayout('1 3')).toEqual([1, 3]);
    expect(parseColumnsLayout([1.4, 99])).toEqual([1, 6]);
    for (const bad of [[1], [1, 1, 1, 1, 1], [1, 0], [1, -1], [1, Number.NaN], '1fr', 'auto 1fr']) {
      expect(parseColumnsLayout(bad)).toBeNull();
    }
    expect(parseColumnsLayout('repeat(9, 1fr)')).toBeNull();
    expect(parseColumnsLayout(null)).toBeNull();
    expect(parseColumnsLayout({ length: 2 })).toBeNull();
  });
});

describe('Columns: HTML, markdown and JSON', () => {
  it('saves as data-tei-columns divs, and reads that back', () => {
    const editor = make(TWO);
    expect(outline(editor)).toEqual(TWO_SHAPE);
    const html = editor.getHTML();
    expect(html).toBe(
      '<div data-tei-columns="1fr 2fr"><div data-tei-column="1"><p>A</p><ul><li>B</li></ul></div><div data-tei-column="2"><p>C</p></div></div><p>After</p>',
    );
    expect(outline(make(html))).toEqual(TWO_SHAPE);
    expect(outline(make(editor.getJSON()))).toEqual(TWO_SHAPE);
  });

  it('draws widths as attributes, never a style; the control before the columns', () => {
    make(TWO);
    const box = document.querySelector('.tei-columns') as HTMLElement;
    expect(box.getAttribute('role')).toBe('group');
    expect(box.getAttribute('aria-label')).toBe('Columns');
    expect(box.firstElementChild?.hasAttribute('data-tei-columns-control')).toBe(true);
    expect(box.firstElementChild?.querySelector('svg')).not.toBeNull();
    const columns = [...box.querySelectorAll('.tei-column')];
    expect(columns.map((c) => c.getAttribute('data-tei-column'))).toEqual(['1', '2']);
    expect(box.querySelector('[style]')).toBeNull();
    expect(box.hasAttribute('style')).toBe(false);
  });

  it('reads the Lexical playground’s layout, its tracks from the style', () => {
    const editor = make(
      '<div data-lexical-layout-container="true" style="grid-template-columns: 1fr 3fr"><div data-lexical-layout-item="true"><p>L</p></div><div data-lexical-layout-item="true"><p>R</p></div></div>',
    );
    expect(outline(editor)).toEqual([
      'columns 1:3',
      '  column',
      '    paragraph L',
      '  column',
      '    paragraph R',
    ]);
    const plain = make(
      '<div data-lexical-layout-container><div data-lexical-layout-item><p>1</p></div><div data-lexical-layout-item><p>2</p></div><div data-lexical-layout-item><p>3</p></div></div>',
    );
    expect(outline(plain)[0]).toBe('columns 1:1:1');
    // Ours: each column's own width wins over the container's track list.
    const own = make(
      '<div data-tei-columns="1fr 1fr"><div data-tei-column="3"><p>a</p></div><div data-tei-column><p>b</p></div></div>',
    );
    expect(outline(own)[0]).toBe('columns 3:1');
  });

  it('hostile HTML: loose blocks, a lone column, too many, too few, empty, nested', () => {
    const loose = make(
      '<div data-tei-columns="1fr 1fr">x<p>Before</p><div data-tei-column><p>One</p></div> <p>Loose</p><div data-tei-column="bogus"><p>Two</p></div></div>',
    );
    expect(outline(loose)).toEqual([
      'columns 1:1:1',
      '  column',
      '    paragraph x',
      '    paragraph Before',
      '  column',
      '    paragraph One',
      '    paragraph Loose',
      '  column',
      '    paragraph Two',
    ]);
    const five = make(
      `<div data-tei-columns>${[1, 2, 3, 4, 5].map((n) => `<div data-tei-column><p>${n}</p></div>`).join('')}</div>`,
    );
    expect(outline(five)).toEqual([
      'columns 1:1:1:1',
      '  column',
      '    paragraph 1',
      '  column',
      '    paragraph 2',
      '  column',
      '    paragraph 3',
      '  column',
      '    paragraph 4',
      '    paragraph 5',
    ]);
    expect(
      outline(make('<div data-tei-columns><div data-tei-column><p>Only</p></div></div><p>x</p>')),
    ).toEqual(['paragraph Only', 'paragraph x']);
    expect(outline(make('<div data-tei-columns></div><p>x</p>'))).toEqual(['paragraph x']);
    expect(
      outline(
        make(
          '<div data-tei-columns><div data-tei-column></div><div data-tei-column><p>B</p></div></div>',
        ),
      ),
    ).toEqual(['columns 1:1', '  column', '    paragraph', '  column', '    paragraph B']);
    expect(outline(make('<div data-tei-column><p>Stray</p></div>'))).toEqual(['paragraph Stray']);
    const nested = make(
      '<div data-tei-columns><div data-tei-column><div data-tei-columns><div data-tei-column><p>a</p></div><div data-tei-column><p>b</p></div></div></div><div data-tei-column><p>c</p></div></div>',
    );
    expect(outline(nested)).toEqual([
      'columns 1:1',
      '  column',
      '    paragraph a',
      '    paragraph b',
      '  column',
      '    paragraph c',
    ]);
    // Scripts and handlers in a column go nowhere.
    const hostile = make(
      '<div data-tei-columns="1fr 1fr" onclick="alert(1)"><div data-tei-column="1" onmouseover="x()"><p>A</p><script>alert(1)</script></div><div data-tei-column><img src=x onerror="alert(1)"><p>B</p></div></div>',
    );
    expect(hostile.getHTML()).not.toMatch(/script|onclick|onerror|onmouseover|alert/);
  });

  it('round-trips markdown in HTML comments; an unclosed one stays text', () => {
    const md =
      '<!-- columns 1fr 2fr -->\n\nA\n\n- B\n\n<!-- column -->\n\nC **bold**\n\n<!-- /columns -->\n\nAfter';
    const editor = make(md, { markdown: true });
    expect(outline(editor)).toEqual([
      'columns 1:2',
      '  column',
      '    paragraph A',
      '    list B',
      '  column',
      '    paragraph C bold',
      'paragraph After',
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(make(TWO).getMarkdown()).toBe(
      '<!-- columns 1fr 2fr -->\n\nA\n\n- B\n\n<!-- column -->\n\nC\n\n<!-- /columns -->\n\nAfter',
    );
    expect(outline(make('<!-- columns -->\n\nx', { markdown: true }))).not.toContain('columns 1:1');
    // An empty column comes back as one empty line.
    const empty = make('<!-- columns 1fr 1fr -->\n<!-- column -->\nB\n<!-- /columns -->', {
      markdown: true,
    });
    expect(outline(empty)).toEqual([
      'columns 1:1',
      '  column',
      '    paragraph',
      '  column',
      '    paragraph B',
    ]);
  });

  it('keeps its shape whatever JSON says', () => {
    const p = (text: string) => ({
      type: 'paragraph',
      version: 1,
      children: [{ type: 'text', text, version: 1 }],
    });
    const editor = make({
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'columns',
            version: 1,
            children: [
              p('loose'),
              { type: 'column', width: 99, version: 1, children: [p('one')] },
              { type: 'column', width: 'wide', version: 1, children: [] },
              {
                type: 'column',
                width: 2,
                version: 1,
                children: [{ type: 'text', text: 'bare', version: 1 }],
              },
            ],
          },
          { type: 'column', version: 1, children: [p('stray')] },
          { type: 'columns', version: 1, children: [] },
        ],
      },
    });
    expect(outline(editor)).toEqual([
      'columns 6:1:2',
      '  column',
      '    paragraph loose',
      '    paragraph one',
      '  column',
      '    paragraph',
      '  column',
      '    paragraph bare',
      'paragraph stray',
    ]);
  });
});

describe('Columns: commands', () => {
  it('insertColumns puts empty columns in, the caret in the first; not inside a column', () => {
    const editor = make('<p>Intro</p>');
    caret(editor, 'Intro');
    expect(editor.can().insertColumns()).toBe(true);
    expect(editor.can().insertColumns([1, 0])).toBe(false);
    expect(editor.commands.insertColumns('1fr 2fr 1fr')).toBe(true);
    expect(outline(editor)).toEqual([
      'paragraph Intro',
      'columns 1:2:1',
      '  column',
      '    paragraph',
      '  column',
      '    paragraph',
      '  column',
      '    paragraph',
      // At the end of the document, a line after it to go on with.
      'paragraph',
    ]);
    expect(editor.read(() => $isColumnNode($getSelection()?.getNodes()[0]?.getParent()))).toBe(
      true,
    );
    expect(editor.isActive('columns')).toBe(true);
    expect(editor.isActive('columnsLayout', [1, 2, 1])).toBe(true);
    expect(editor.isActive('columnsLayout', '1fr 1fr')).toBe(false);
    expect(editor.can().insertColumns()).toBe(false);
    expect(editor.commands.insertColumns()).toBe(false);
  });

  it('on an empty line, the columns take its place', () => {
    const editor = make('<p>Intro</p><p></p><p>End</p>');
    editor.update(() => {
      const empty = $getRoot().getChildAtIndex(1);
      if ($isElementNode(empty)) empty.select();
    });
    editor.commands.insertColumns();
    expect(outline(editor)).toEqual([
      'paragraph Intro',
      'columns 1:1',
      '  column',
      '    paragraph',
      '  column',
      '    paragraph',
      'paragraph End',
    ]);
  });

  it('setColumnsLayout changes widths, adds empty columns, folds dropped ones into the last kept', () => {
    const editor = make(TWO);
    caret(editor, 'A');
    expect(editor.commands.setColumnsLayout([2, 1])).toBe(true);
    expect(outline(editor)[0]).toBe('columns 2:1');
    editor.commands.setColumnsLayout('1fr 1fr 1fr 1fr');
    expect(outline(editor).filter((l) => l.trim() === 'column')).toHaveLength(4);
    // Blank columns go without a trace; one with blocks hands them on.
    editor.commands.setColumnsLayout([1, 1, 1]);
    editor.commands.setColumnsLayout([1, 1]);
    expect(outline(editor)).toEqual([
      'columns 1:1',
      '  column',
      '    paragraph A',
      '    list B',
      '  column',
      '    paragraph C',
      'paragraph After',
    ]);
    editor.update(() => {
      const columns = $getRoot().getFirstChild();
      if ($isColumnsNode(columns))
        columns.getLastChild<LexicalNode & { selectEnd(): void }>()?.selectEnd();
    });
    editor.commands.setColumnsLayout([1, 1, 1]);
    caret(editor, 'A');
    const key = editor.read(() => $getRoot().getFirstChild()?.getKey() ?? '');
    caret(editor, 'After');
    expect(editor.can().setColumnsLayout([1, 1])).toBe(false);
    expect(editor.can().setColumnsLayout([1, 1], key)).toBe(true);
    expect(editor.commands.setColumnsLayout('nonsense', key)).toBe(false);
    expect(editor.commands.setColumnsLayout([1, 1], 'nokey')).toBe(false);
    expect(editor.commands.setColumnsLayout([3, 1], key)).toBe(true);
    expect(outline(editor)[0]).toBe('columns 3:1');
  });

  it('addColumn adds one after the caret’s, up to four', () => {
    const editor = make(TWO);
    caret(editor, 'A');
    expect(editor.commands.addColumn()).toBe(true);
    expect(outline(editor).slice(0, 7)).toEqual([
      'columns 1:1:2',
      '  column',
      '    paragraph A',
      '    list B',
      '  column',
      '    paragraph',
      '  column',
    ]);
    expect(at(editor)).toBe('paragraph');
    expect(editor.commands.addColumn()).toBe(true);
    expect(editor.can().addColumn()).toBe(false);
    expect(editor.commands.addColumn()).toBe(false);
  });

  it('removeColumn takes the caret’s column; down to one, the rest are blocks', () => {
    const editor = make(
      '<div data-tei-columns><div data-tei-column><p>A</p></div><div data-tei-column><p>B</p></div><div data-tei-column><p>C</p></div></div>',
    );
    caret(editor, 'B');
    expect(editor.can().removeColumn()).toBe(true);
    expect(editor.can().removeColumn(7)).toBe(false);
    editor.commands.removeColumn();
    expect(outline(editor)).toEqual([
      'columns 1:1',
      '  column',
      '    paragraph A',
      '  column',
      '    paragraph C',
    ]);
    expect(at(editor)).toBe('paragraph C');
    editor.commands.removeColumn(0);
    expect(outline(editor)).toEqual(['paragraph C']);
    expect(at(editor)).toBe('paragraph C');
    expect(editor.commands.removeColumn()).toBe(false);
  });

  it('unsetColumns lays the blocks out in order, keeping the caret', () => {
    const editor = make(TWO);
    caret(editor, 'C', 1);
    expect(editor.can().unsetColumns()).toBe(true);
    editor.commands.unsetColumns();
    expect(outline(editor)).toEqual(['paragraph A', 'list B', 'paragraph C', 'paragraph After']);
    expect(at(editor)).toBe('paragraph C');
    expect(editor.can().unsetColumns()).toBe(false);
    expect(editor.isActive('columns')).toBe(false);
  });

  it('builds with $createColumns', () => {
    const editor = make('<p>x</p>');
    editor.update(() => {
      $getRoot().append($createColumns([1, 2]));
    });
    expect(outline(editor).slice(1)).toEqual([
      'columns 1:2',
      '  column',
      '    paragraph',
      '  column',
      '    paragraph',
    ]);
  });
});

describe('Columns: keys', () => {
  it('Enter on an empty last line stays in the column', () => {
    const editor = make(TWO);
    caret(editor, 'C');
    key(editor, KEY_ENTER_COMMAND);
    key(editor, KEY_ENTER_COMMAND);
    expect(outline(editor).slice(4, 9)).toEqual([
      '  column',
      '    paragraph C',
      '    paragraph',
      '    paragraph',
      'paragraph After',
    ]);
  });

  it('Tab and Shift-Tab step between columns and never out; lists keep their Tab', () => {
    const editor = make(TWO);
    caret(editor, 'A');
    expect(editor.can().nextColumn()).toBe(true);
    editor.commands.nextColumn();
    expect(at(editor)).toBe('paragraph C');
    // The last column: the caret stays.
    expect(editor.commands.nextColumn()).toBe(true);
    expect(at(editor)).toBe('paragraph C');
    editor.commands.previousColumn();
    expect(at(editor)).toBe('listitem B');
    // In a list, Tab is the list's.
    expect(editor.can().nextColumn()).toBe(false);
    expect(editor.commands.previousColumn()).toBe(false);
    caret(editor, 'A');
    expect(editor.commands.previousColumn()).toBe(true);
    expect(at(editor)).toBe('paragraph A');
    caret(editor, 'After');
    expect(editor.commands.nextColumn()).toBe(false);
  });

  it('ArrowDown at a column’s end and ArrowRight at the last one’s go after the block', () => {
    const editor = make(TWO);
    caret(editor, 'B');
    expect(key(editor, KEY_ARROW_DOWN_COMMAND, { key: 'ArrowDown' })).toBe(true);
    expect(at(editor)).toBe('paragraph After');
    // Mid-text, or with Shift: the browser's.
    caret(editor, 'C', 0);
    expect(key(editor, KEY_ARROW_DOWN_COMMAND, { key: 'ArrowDown' })).toBe(false);
    caret(editor, 'C');
    expect(key(editor, KEY_ARROW_DOWN_COMMAND, { key: 'ArrowDown', shiftKey: true })).toBe(false);
    // ArrowRight at the first column's end goes to the next column: the browser's.
    caret(editor, 'B');
    key(editor, KEY_ARROW_RIGHT_COMMAND, { key: 'ArrowRight' });
    expect(at(editor)).not.toBe('paragraph After');
    caret(editor, 'C');
    expect(key(editor, KEY_ARROW_RIGHT_COMMAND, { key: 'ArrowRight' })).toBe(true);
    expect(at(editor)).toBe('paragraph After');
  });

  it('with nothing after or before the block, the arrows make a line there', () => {
    const editor = make(
      '<div data-tei-columns><div data-tei-column><p>A</p></div><div data-tei-column><p>B</p></div></div>',
    );
    caret(editor, 'B');
    key(editor, KEY_ARROW_RIGHT_COMMAND, { key: 'ArrowRight' });
    expect(outline(editor).at(-1)).toBe('paragraph');
    expect(at(editor)).toBe('paragraph');
    // Back at the second column's start: into the first, the browser's way.
    caret(editor, 'B', 0);
    key(editor, KEY_ARROW_LEFT_COMMAND, { key: 'ArrowLeft' });
    expect(outline(editor)[0]).toBe('columns 1:1');
    caret(editor, 'A', 0);
    expect(key(editor, KEY_ARROW_UP_COMMAND, { key: 'ArrowUp' })).toBe(true);
    expect(outline(editor)[0]).toBe('paragraph');
    expect(at(editor)).toBe('paragraph');
    // Something before: no new line.
    caret(editor, 'A', 0);
    key(editor, KEY_ARROW_LEFT_COMMAND, { key: 'ArrowLeft' });
    expect(outline(editor).slice(0, 2)).toEqual(['paragraph', 'columns 1:1']);
  });

  it('Backspace at a column’s start stays in the block; in a blank block, takes it away', () => {
    const editor = make(TWO);
    caret(editor, 'C', 0);
    expect(key(editor, KEY_BACKSPACE_COMMAND)).toBe(true);
    expect(at(editor)).toBe('listitem B');
    expect(outline(editor)).toEqual(TWO_SHAPE);
    caret(editor, 'A', 0);
    expect(key(editor, KEY_BACKSPACE_COMMAND)).toBe(true);
    expect(outline(editor)).toEqual(TWO_SHAPE);
    // An empty first line with more after: the line goes.
    const lined = make(
      '<div data-tei-columns><div data-tei-column><p></p><p>X</p></div><div data-tei-column><p>Y</p></div></div>',
    );
    lined.update(() => {
      const first = $getRoot().getFirstDescendant();
      if ($isElementNode(first)) first.select();
    });
    key(lined, KEY_BACKSPACE_COMMAND);
    expect(outline(lined).slice(0, 3)).toEqual(['columns 1:1', '  column', '    paragraph X']);
    const blank = make('<p>Intro</p>');
    caret(blank, 'Intro');
    blank.commands.insertColumns();
    key(blank, KEY_BACKSPACE_COMMAND);
    expect(outline(blank)).toEqual(['paragraph Intro', 'paragraph', 'paragraph']);
    expect(blank.read(() => $getSelection()?.getNodes()[0]?.getIndexWithinParent())).toBe(1);
  });

  it('Delete at a column’s end does not pull the next column in', () => {
    const editor = make(TWO);
    caret(editor, 'C');
    expect(key(editor, KEY_DELETE_COMMAND)).toBe(true);
    expect(outline(editor)).toEqual(TWO_SHAPE);
    expect(at(editor)).toBe('paragraph C');
  });

  it('marks the block the caret is in, for its control', () => {
    const editor = make(TWO);
    const box = () => document.querySelector('.tei-columns') as HTMLElement;
    caret(editor, 'A');
    expect(box().hasAttribute('data-tei-caret')).toBe(true);
    caret(editor, 'After');
    expect(box().hasAttribute('data-tei-caret')).toBe(false);
  });

  it('with no menu, a click on the control steps through the layouts with as many columns', () => {
    const editor = make(TWO);
    const control = () => document.querySelector('[data-tei-columns-control]') as HTMLElement;
    control().click();
    expect(outline(editor)[0]).toBe('columns 2:1');
    control().click();
    expect(outline(editor)[0]).toBe('columns 1:1');
    expect(editor.commands.openColumnsMenu()).toBe(false);
    const reader = make(TWO, { editable: false });
    const readerControl = reader.lexical
      .getRootElement()
      ?.querySelector<HTMLElement>('[data-tei-columns-control]');
    readerControl?.click();
    expect(readerControl).toBeTruthy();
    expect(outline(reader)[0]).toBe('columns 1:2');
  });

  it('offers its layouts in the slash menu and the columns menu', () => {
    const editor = make(TWO);
    const slash = editor.items('slash').filter((i) => i.command === 'insertColumns');
    expect(slash.map((i) => [i.id, editor.t(i.label)])).toEqual([
      ['columns', '2 columns'],
      ['columns-1-2', '2 columns: narrow, wide'],
      ['columns-2-1', '2 columns: wide, narrow'],
      ['columns-1-1-1', '3 columns'],
      ['columns-1-2-1', '3 columns: wide middle'],
      ['columns-1-1-1-1', '4 columns'],
    ]);
    expect(editor.items('columnsMenu').map((i) => i.id)).toEqual([
      'columnsLayout-1-1',
      'columnsLayout-1-2',
      'columnsLayout-2-1',
      'columnsLayout-1-1-1',
      'columnsLayout-1-2-1',
      'columnsLayout-1-1-1-1',
      'addColumn',
      'unsetColumns',
      'removeColumn',
    ]);
  });
});
