import { $isListItemNode, $isListNode, type ListNode } from '@lexical/list';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { $blocks, Blocks } from '../../src/extensions/blocks/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { Table } from '../../src/extensions/table/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string) {
  const editor = createTeiEditor({ extensions: [StarterKit, Table, Blocks], content });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/**
 * The document as an outline: `p A`, `ul` (a list, with its start when not
 * 1), `- B` (an item), nested lines indented two spaces a level.
 */
function outline(editor: TeiEditor): string[] {
  const lines: string[] = [];
  const visit = (node: LexicalNode, depth: number) => {
    const pad = '  '.repeat(depth);
    if ($isListNode(node)) {
      const start = node.getStart() !== 1 ? ` ${node.getStart()}` : '';
      lines.push(`${pad}${node.getListType()}${start}`);
      for (const item of node.getChildren()) {
        const nested = $isElementNode(item) ? item.getChildren() : [];
        if (nested.length === 1 && $isListNode(nested[0])) visit(nested[0] as ListNode, depth + 1);
        else lines.push(`${pad}- ${item.getTextContent()}`);
      }
    } else lines.push(`${pad}${node.getType()} ${node.getTextContent()}`.trimEnd());
  };
  editor.read(() => {
    for (const child of $getRoot().getChildren()) visit(child, 0);
  });
  return lines;
}

/** The key of the block whose text is `text`. */
const key = (editor: TeiEditor, text: string) =>
  editor.read(() => {
    const block = $blocks().find((b) => b.getTextContent() === text);
    if (!block) throw new Error(`no block "${text}"`);
    return block.getKey();
  });

/** The caret at the start of the block whose text is `text`. */
const caretIn = (editor: TeiEditor, text: string) => editor.commands.selectBlock(key(editor, text));

const LIST = '<ul><li>One</li><li>Two<ul><li>Two a</li><li>Two b</li></ul></li><li>Three</li></ul>';

describe('blocks: what they are', () => {
  it('children of the document, and each list item at any depth, in order', () => {
    const editor = make(`<p>A</p>${LIST}<p>B</p>`);
    expect(editor.read(() => $blocks().map((b) => b.getTextContent()))).toEqual([
      'A',
      'One',
      'Two',
      'Two a',
      'Two b',
      'Three',
      'B',
    ]);
  });

  it('a table is one block, whatever cell the caret is in', () => {
    const editor = make('<p>A</p><table><tr><td>x</td></tr></table>');
    editor.update(() => {
      const cell = $getRoot().getLastChild();
      if ($isElementNode(cell)) cell.selectEnd();
    });
    expect(editor.can().moveBlockUp()).toBe(true);
    editor.commands.moveBlockUp();
    expect(outline(editor)).toEqual(['table x', 'paragraph A']);
  });
});

describe('blocks: moving', () => {
  it('a paragraph before or after another', () => {
    const editor = make('<p>A</p><p>B</p><p>C</p>');
    expect(editor.commands.moveBlock(key(editor, 'A'), key(editor, 'C'), 'after')).toBe(true);
    expect(outline(editor)).toEqual(['paragraph B', 'paragraph C', 'paragraph A']);
    editor.commands.moveBlock(key(editor, 'A'), key(editor, 'B'), 'before');
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph B', 'paragraph C']);
  });

  it('up and down from the caret; not past either end', () => {
    const editor = make('<p>A</p><h2>B</h2><p>C</p>');
    caretIn(editor, 'B');
    editor.commands.moveBlockUp();
    expect(outline(editor)).toEqual(['heading B', 'paragraph A', 'paragraph C']);
    expect(editor.can().moveBlockUp()).toBe(false);
    expect(editor.commands.moveBlockUp()).toBe(false);
    editor.commands.moveBlockDown();
    editor.commands.moveBlockDown();
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph C', 'heading B']);
    expect(editor.can().moveBlockDown()).toBe(false);
    // The caret moved with it.
    editor.update(() => {});
    expect(editor.read(() => $blocks().at(-1)?.getTextContent())).toBe('B');
  });

  it('is one undo step', () => {
    const editor = make('<p>A</p><p>B</p>');
    caretIn(editor, 'A');
    editor.commands.moveBlockDown();
    editor.commands.undo();
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph B']);
  });

  it('a list item carries what is nested under it', () => {
    const editor = make(LIST);
    editor.commands.moveBlock(key(editor, 'Two'), key(editor, 'One'), 'before');
    expect(outline(editor)).toEqual([
      'bullet',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
      '- One',
      '- Three',
    ]);
    editor.commands.moveBlock(key(editor, 'Two'), key(editor, 'Three'), 'after');
    expect(outline(editor)).toEqual([
      'bullet',
      '- One',
      '- Three',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
    ]);
  });

  it('a list item out among other blocks is a list of its own', () => {
    const editor = make(`<p>A</p>${LIST}`);
    editor.commands.moveBlock(key(editor, 'Three'), key(editor, 'A'), 'before');
    expect(outline(editor)).toEqual([
      'bullet',
      '- Three',
      'paragraph A',
      'bullet',
      '- One',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
    ]);
  });

  it('the last item out of a nested list takes the list and its holder with it', () => {
    const editor = make('<ul><li>One<ul><li>Inner</li></ul></li></ul><p>A</p>');
    editor.commands.moveBlock(key(editor, 'Inner'), key(editor, 'A'), 'after');
    expect(outline(editor)).toEqual(['bullet', '- One', 'paragraph A', 'bullet', '- Inner']);
  });

  it('the last item out of a list takes the list', () => {
    const editor = make('<p>A</p><ol><li>Only</li></ol><p>B</p>');
    editor.commands.moveBlock(key(editor, 'Only'), key(editor, 'B'), 'after');
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph B', 'number', '- Only']);
  });

  it('a paragraph into a list splits it; a numbered list counts on', () => {
    const editor = make('<p>A</p><ol><li>One</li><li>Two</li><li>Three</li></ol>');
    editor.commands.moveBlock(key(editor, 'A'), key(editor, 'Two'), 'after');
    expect(outline(editor)).toEqual([
      'number',
      '- One',
      '- Two',
      'paragraph A',
      'number 3',
      '- Three',
    ]);
    // Out again: the halves join up.
    editor.commands.moveBlock(key(editor, 'A'), key(editor, 'One'), 'before');
    expect(outline(editor)).toEqual(['paragraph A', 'number', '- One', '- Two', '- Three']);
  });

  it('a paragraph beside the first or last item goes before or after the list', () => {
    const editor = make('<p>A</p><ul><li>One</li><li>Two</li></ul><p>B</p>');
    editor.commands.moveBlock(key(editor, 'B'), key(editor, 'One'), 'before');
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph B', 'bullet', '- One', '- Two']);
    editor.commands.moveBlock(key(editor, 'A'), key(editor, 'Two'), 'after');
    expect(outline(editor)).toEqual(['paragraph B', 'bullet', '- One', '- Two', 'paragraph A']);
  });

  it('never into itself or what is nested under it', () => {
    const editor = make(LIST);
    expect(editor.commands.moveBlock(key(editor, 'Two'), key(editor, 'Two a'), 'after')).toBe(
      false,
    );
    expect(editor.commands.moveBlock(key(editor, 'Two'), key(editor, 'Two'), 'after')).toBe(false);
    expect(outline(editor)).toEqual([
      'bullet',
      '- One',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
      '- Three',
    ]);
  });

  it('down past an item with nested ones goes after them too', () => {
    const editor = make(LIST);
    caretIn(editor, 'One');
    editor.commands.moveBlockDown();
    expect(outline(editor)).toEqual([
      'bullet',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
      '- One',
      '- Three',
    ]);
  });

  it('up past an item with nested ones: before it, not among them', () => {
    const editor = make(LIST);
    caretIn(editor, 'Three');
    editor.commands.moveBlockUp();
    expect(outline(editor)).toEqual([
      'bullet',
      '- One',
      '- Three',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
    ]);
  });

  it('at either end of a nested list: out of it, beside the item it hangs from', () => {
    const editor = make(LIST);
    caretIn(editor, 'Two a');
    editor.commands.moveBlockUp();
    expect(outline(editor)).toEqual([
      'bullet',
      '- One',
      '- Two a',
      '- Two',
      '  bullet',
      '  - Two b',
      '- Three',
    ]);
    caretIn(editor, 'Two b');
    editor.commands.moveBlockDown();
    expect(outline(editor)).toEqual(['bullet', '- One', '- Two a', '- Two', '- Two b', '- Three']);
  });

  it('past a list: beside its first or last item, as Notion does', () => {
    const editor = make(`<p>Before</p>${LIST}<p>After</p>`);
    caretIn(editor, 'After');
    editor.commands.moveBlockUp();
    expect(outline(editor).slice(-3)).toEqual(['paragraph After', 'bullet', '- Three']);
    caretIn(editor, 'Before');
    editor.commands.moveBlockDown();
    expect(outline(editor).slice(0, 3)).toEqual(['bullet', '- One', 'paragraph Before']);
    // The list's first item up: a list of its own above what was before it.
    caretIn(editor, 'One');
    expect(editor.can().moveBlockUp()).toBe(false);
  });

  it('refuses keys that are not blocks, and bad places', () => {
    const editor = make('<p>A <strong>b</strong></p><p>C</p>');
    const text = editor.read(() =>
      $getRoot()
        .getFirstChildOrThrow<LexicalNode & { getFirstChild(): LexicalNode }>()
        .getFirstChild()
        .getKey(),
    );
    expect(editor.commands.moveBlock(text, key(editor, 'C'), 'after')).toBe(false);
    expect(editor.commands.moveBlock(key(editor, 'A b'), 'nope', 'after')).toBe(false);
    expect(
      editor.commands.moveBlock(key(editor, 'A b'), key(editor, 'C'), 'inside' as 'after'),
    ).toBe(false);
    expect(outline(editor)).toEqual(['paragraph A b', 'paragraph C']);
  });
});

describe('blocks: duplicating, deleting, adding', () => {
  it('duplicate: a copy after it, with what is nested under it; the caret in the copy', () => {
    const editor = make(LIST);
    caretIn(editor, 'Two');
    editor.commands.duplicateBlock();
    expect(outline(editor)).toEqual([
      'bullet',
      '- One',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
      '- Three',
    ]);
    // The caret is in the copy, where it was: it is the one that moves.
    editor.commands.moveBlockDown();
    expect(outline(editor)).toEqual([
      'bullet',
      '- One',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
      '- Three',
      '- Two',
      '  bullet',
      '  - Two a',
      '  - Two b',
    ]);
  });

  it('duplicate: a caret or a selection goes to the same place in the copy', () => {
    const editor = make('<p>Hello <b>world</b></p>');
    editor.update(() => {
      const bold = $getRoot().getFirstChildOrThrow<ElementNode>().getLastChildOrThrow<TextNode>();
      bold.select(1, 3);
    });
    editor.commands.duplicateBlock();
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText('!');
    });
    expect(outline(editor)).toEqual(['paragraph Hello world', 'paragraph Hello w!ld']);
  });

  it('duplicate keeps formatting and a decorator', () => {
    const editor = make('<p>A <strong>bold</strong></p><hr>');
    editor.commands.duplicateBlock(key(editor, 'A bold'));
    expect(editor.getHTML()).toBe(
      '<p>A <strong>bold</strong></p><p>A <strong>bold</strong></p><hr>',
    );
    const rule = editor.read(() => ($getRoot().getLastChild() as LexicalNode).getKey());
    editor.commands.duplicateBlock(rule);
    expect(outline(editor)).toEqual([
      'paragraph A bold',
      'paragraph A bold',
      'horizontalrule',
      'horizontalrule',
    ]);
  });

  it('delete: the caret goes to the next block; a list left empty goes', () => {
    const editor = make('<p>A</p><ul><li>Only</li></ul><p>B</p>');
    editor.commands.deleteBlock(key(editor, 'Only'));
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph B']);
    editor.commands.insertBlock(key(editor, 'B'), 'after', 'x');
    expect(editor.read(() => $blocks().at(-1)?.getTextContent())).toBe('x');
  });

  it('delete the last block: an empty line stays', () => {
    const editor = make('<h1>Title</h1>');
    caretIn(editor, 'Title');
    editor.commands.deleteBlock();
    expect(outline(editor)).toEqual(['paragraph']);
  });

  it('insert: a new line after (or before) with the caret in it, started with text', () => {
    const editor = make('<p>A</p><p>B</p>');
    editor.commands.insertBlock(key(editor, 'A'), 'after', '/');
    expect(outline(editor)).toEqual(['paragraph A', 'paragraph /', 'paragraph B']);
    editor.update(() => $getRoot().getChildren()[1]?.remove());
    editor.commands.insertBlock(key(editor, 'A'), 'before');
    editor.update(() => {});
    expect(outline(editor)).toEqual(['paragraph', 'paragraph A', 'paragraph B']);
  });

  it('insert after a list item: a line between the halves of the list', () => {
    const editor = make('<ul><li>One</li><li>Two</li></ul>');
    editor.commands.insertBlock(key(editor, 'One'));
    expect(outline(editor)).toEqual(['bullet', '- One', 'paragraph', 'bullet', '- Two']);
  });
});

describe('blocks: keys and menu', () => {
  it('binds Mod-Shift-Arrow and Mod-d, and offers its items in the block menu', () => {
    const editor = make('<p>A</p>');
    expect(editor.shortcut('moveBlockUp')).toEqual(['Ctrl', 'Shift', '↑']);
    expect(editor.shortcut('moveBlockDown')).toEqual(['Ctrl', 'Shift', '↓']);
    expect(editor.shortcut('duplicateBlock')).toEqual(['Ctrl', 'D']);
    expect(editor.items('blockMenu').map((item) => item.id)).toEqual(
      expect.arrayContaining(['duplicateBlock', 'moveBlockUp', 'moveBlockDown', 'deleteBlock']),
    );
  });

  it('list items are blocks of their list only at the top of the document', () => {
    const editor = make('<table><tr><td><ul><li>In a cell</li></ul></td></tr></table>');
    editor.update(() => {
      const item = $getRoot().getAllTextNodes()[0]?.getParent();
      if ($isListItemNode(item)) item.selectEnd();
    });
    // The block is the table, not the item in it.
    expect(editor.read(() => $blocks().map((b) => b.getType()))).toEqual(['table']);
  });
});
