import {
  $createTableSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
} from '@lexical/table';
import { $getRoot, $getSelection, $setSelection, KEY_TAB_COMMAND, type LexicalNode } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { headerState } from '../../src/extensions/table/header-import.js';
import { Table } from '../../src/extensions/table/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: unknown = '<p>Hello</p>', contentFormat?: 'markdown' | 'json') {
  const editor = createTeiEditor({ extensions: [StarterKit, Table], content, contentFormat });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const $table = (index = 0): TableNode =>
  $getRoot().getChildren().filter($isTableNode)[index] as TableNode;

/** The table's cells' text, row by row; `H:` marks a header cell. */
const grid = (editor: TeiEditor, index = 0) =>
  editor.read(() => {
    const table = $table(index);
    if (!table) return null;
    return table
      .getChildren()
      .filter($isTableRowNode)
      .map((row) =>
        row
          .getChildren()
          .filter($isTableCellNode)
          .map((cell) => `${cell.hasHeader() ? 'H:' : ''}${cell.getTextContent()}`),
      );
  });

function $cellAt(row: number, column: number): TableCellNode {
  const r = $table().getChildAtIndex(row) as LexicalNode & { getChildAtIndex(i: number): unknown };
  return r.getChildAtIndex(column) as TableCellNode;
}

/** Caret in a cell. */
function caret(editor: TeiEditor, row: number, column: number) {
  editor.update(() => $cellAt(row, column).selectStart());
}

/** A cell selection from one cell to another. */
function cells(editor: TeiEditor, from: [number, number], to: [number, number]) {
  editor.update(() => {
    const table = $table();
    const selection = $createTableSelection();
    const a = $cellAt(...from);
    const b = $cellAt(...to);
    selection.set(table.getKey(), a.getKey(), b.getKey());
    $setSelection(selection);
  });
}

/** Type into the cell with the caret. */
function type(editor: TeiEditor, text: string) {
  editor.update(() => $getSelection()?.insertText(text));
}

function fill(editor: TeiEditor) {
  const rows = grid(editor) ?? [];
  rows.forEach((row, r) => {
    row.forEach((_cell, c) => {
      caret(editor, r, c);
      type(editor, `${r}${c}`);
    });
  });
}

describe('Table', () => {
  it('inserts a 3 × 3 table with a header row, the caret in its first cell', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    expect(editor.commands.insertTable()).toBe(true);
    expect(grid(editor)).toEqual([
      ['H:', 'H:', 'H:'],
      ['', '', ''],
      ['', '', ''],
    ]);
    type(editor, 'x');
    expect(grid(editor)?.[0]?.[0]).toBe('H:x');
    expect(editor.isActive('table')).toBe(true);
    expect(editor.isActive('headerRow')).toBe(true);
  });

  it('takes a size and headers, and clamps the size', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 4, { row: false, column: true });
    expect(grid(editor)).toEqual([
      ['H:', '', '', ''],
      ['H:', '', '', ''],
    ]);
    const second = make();
    second.update(() => $getRoot().selectEnd());
    second.commands.insertTable(0, 999);
    expect(grid(second)?.length).toBe(1);
    expect(grid(second)?.[0]?.length).toBe(20);
  });

  it('refuses a table inside a table, unless nested tables are on', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2);
    expect(editor.can().insertTable()).toBe(false);
    expect(editor.commands.insertTable()).toBe(false);
    setExtensionOptions(editor, Table, { nestedTables: true });
    expect(editor.can().insertTable()).toBe(true);
  });

  it('adds rows and columns on either side of the caret', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2, { row: false });
    fill(editor);
    caret(editor, 0, 0);
    editor.commands.addRowAfter();
    editor.commands.addColumnBefore();
    expect(grid(editor)).toEqual([
      ['', '00', '01'],
      ['', '', ''],
      ['', '10', '11'],
    ]);
    caret(editor, 2, 2);
    editor.commands.addRowBefore();
    editor.commands.addColumnAfter();
    expect(grid(editor)).toEqual([
      ['', '00', '01', ''],
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '10', '11', ''],
    ]);
  });

  it('the caret stays in its cell as rows and columns go in around it', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2, { row: false });
    fill(editor);
    caret(editor, 1, 1);
    const at = () => editor.read(() => $getSelection()?.getNodes()[0]?.getTextContent());
    for (const command of [
      'addColumnBefore',
      'addColumnAfter',
      'addRowBefore',
      'addRowAfter',
    ] as const) {
      editor.commands[command]();
      expect(at()).toBe('11');
    }
  });

  it('appends a row and a column by table key, wherever the caret is', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2, { row: false });
    fill(editor);
    const key = editor.read(() => $table().getKey());
    editor.update(() => $getRoot().selectStart());
    expect(editor.commands.appendTableRow(key)).toBe(true);
    expect(editor.commands.appendTableColumn(key)).toBe(true);
    expect(grid(editor)).toEqual([
      ['00', '01', ''],
      ['10', '11', ''],
      ['', '', ''],
    ]);
    expect(editor.can().appendTableRow('nope')).toBe(false);
    expect(editor.can().appendTableRow()).toBe(false);
  });

  it('deletes rows and columns; the last one takes the table', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2, { row: false });
    fill(editor);
    caret(editor, 0, 1);
    editor.commands.deleteColumn();
    expect(grid(editor)).toEqual([['00'], ['10']]);
    caret(editor, 1, 0);
    editor.commands.deleteRow();
    expect(grid(editor)).toEqual([['00']]);
    editor.commands.deleteRow();
    expect(grid(editor)).toBeNull();
    // The caret is somewhere sensible; the paragraph that followed the table stays.
    expect(editor.getHTML()).toBe('<p>Hello</p><p><br></p>');
  });

  it('deletes the whole table', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable();
    expect(editor.commands.deleteTable()).toBe(true);
    expect(grid(editor)).toBeNull();
    expect(editor.can().deleteTable()).toBe(false);
  });

  it('toggles the header row and column', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2);
    caret(editor, 1, 1);
    editor.commands.toggleHeaderRow();
    expect(editor.isActive('headerRow')).toBe(false);
    editor.commands.toggleHeaderColumn();
    expect(editor.isActive('headerColumn')).toBe(true);
    expect(grid(editor)).toEqual([
      ['H:', ''],
      ['H:', ''],
    ]);
  });

  it('merges a cell selection and splits it again', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2, { row: false });
    fill(editor);
    caret(editor, 0, 0);
    expect(editor.can().mergeCells()).toBe(false);
    cells(editor, [0, 0], [1, 1]);
    expect(editor.can().mergeCells()).toBe(true);
    editor.commands.mergeCells();
    const merged = editor.read(() => {
      const cell = $cellAt(0, 0);
      return [cell.getColSpan(), cell.getRowSpan()];
    });
    expect(merged).toEqual([2, 2]);
    caret(editor, 0, 0);
    expect(editor.can().splitCell()).toBe(true);
    editor.commands.splitCell();
    expect(editor.read(() => $cellAt(0, 0).getColSpan())).toBe(1);
    expect(grid(editor)?.flat()).toHaveLength(4);
  });

  it('with merging off, nothing merges', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2);
    setExtensionOptions(editor, Table, { cellMerge: false });
    cells(editor, [0, 0], [1, 1]);
    expect(editor.can().mergeCells()).toBe(false);
    expect(editor.items('tableMenu').map((item) => item.id)).not.toContain('mergeCells');
  });

  it('colours cells and aligns them, refusing unsafe colours', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(2, 2);
    cells(editor, [0, 0], [0, 1]);
    expect(editor.commands.setCellBackground('url(x)')).toBe(false);
    expect(editor.commands.setCellBackground('red; position: fixed')).toBe(false);
    editor.commands.setCellBackground('rgb(59 130 246 / 0.18)');
    expect(editor.isActive('cellBackground')).toBe(true);
    expect(editor.isActive('cellBackground', 'rgb(59 130 246 / 0.18)')).toBe(true);
    editor.commands.setCellVerticalAlign('middle');
    expect(editor.isActive('cellVerticalAlign', 'middle')).toBe(true);
    expect(editor.getHTML()).toContain('background-color: rgba(59, 130, 246, 0.18)');
    expect(editor.getHTML()).toContain('vertical-align: middle');
    editor.commands.setCellBackground(null);
    editor.commands.setCellVerticalAlign('top');
    expect(editor.isActive('cellBackground')).toBe(false);
    expect(editor.isActive('cellVerticalAlign', 'top')).toBe(true);
  });

  it('stripes rows and freezes the first row and column', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable();
    editor.chain().toggleRowStriping().toggleFrozenRow().toggleFrozenColumn().run();
    expect(editor.isActive('rowStriping')).toBe(true);
    expect(editor.isActive('frozenRow')).toBe(true);
    expect(editor.isActive('frozenColumn')).toBe(true);
    const json = JSON.stringify(editor.getJSON());
    // Saved, and read back.
    const again = make(JSON.parse(json), 'json');
    again.update(() => $table().getFirstDescendant()?.selectStart());
    expect(again.isActive('rowStriping')).toBe(true);
    expect(again.isActive('frozenColumn')).toBe(true);
    editor.commands.toggleFrozenRow();
    expect(editor.isActive('frozenRow')).toBe(false);
  });

  it('sets column widths, no narrower than the minimum', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(1, 3);
    expect(editor.commands.setColumnWidths([200, 10, 120.6])).toBe(true);
    expect(editor.read(() => $table().getColWidths())).toEqual([200, 48, 121]);
    expect(editor.commands.setColumnWidths([1, 2])).toBe(false);
    expect(editor.commands.setColumnWidths([1, Number.NaN, 3])).toBe(false);
    const key = editor.read(() => $table().getKey());
    editor.update(() => $getRoot().selectStart());
    expect(editor.commands.setColumnWidths([100, 100, 100], key)).toBe(true);
    setExtensionOptions(editor, Table, { resizable: false });
    expect(editor.can().setColumnWidths([100, 100, 100], key)).toBe(false);
  });

  it("Tab in the last cell adds a row and moves into it; elsewhere it is Lexical's", () => {
    const editor = make('<table><tr><td>a</td><td>b</td></tr></table>');
    const tab = (shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
      editor.lexical.dispatchCommand(KEY_TAB_COMMAND, event);
      return event.defaultPrevented;
    };
    caret(editor, 0, 0);
    tab();
    expect(grid(editor)).toEqual([['a', 'b']]);
    caret(editor, 0, 1);
    tab(true);
    expect(grid(editor)).toEqual([['a', 'b']]);
    caret(editor, 0, 1);
    expect(tab()).toBe(true);
    type(editor, 'c');
    expect(grid(editor)).toEqual([
      ['a', 'b'],
      ['c', ''],
    ]);
    setExtensionOptions(editor, Table, { tabAddsRow: false });
    caret(editor, 1, 1);
    tab();
    expect(grid(editor)).toHaveLength(2);
  });

  it('every table command does nothing outside a table', () => {
    const editor = make();
    editor.update(() => $getRoot().selectEnd());
    for (const name of [
      'addRowBefore',
      'addRowAfter',
      'addColumnBefore',
      'addColumnAfter',
      'deleteRow',
      'deleteColumn',
      'deleteTable',
      'toggleHeaderRow',
      'toggleHeaderColumn',
      'mergeCells',
      'splitCell',
      'toggleRowStriping',
      'toggleFrozenRow',
      'toggleFrozenColumn',
    ] as const) {
      expect(editor.can()[name](), name).toBe(false);
      expect(editor.commands[name](), name).toBe(false);
    }
    expect(editor.commands.setCellBackground('red')).toBe(false);
    expect(editor.getHTML()).toBe('<p>Hello</p>');
  });

  it('offers its menu entries in sections, and one insert entry', () => {
    const editor = make();
    expect(editor.items('slash').some((item) => item.id === 'insertTable')).toBe(true);
    const menu = editor.items('tableMenu');
    expect([...new Set(menu.map((item) => item.group))]).toEqual([
      'row',
      'column',
      'cell',
      'table',
    ]);
  });
});

describe('Table HTML', () => {
  it('reads a table, its header cells and spans, and writes it back the same', () => {
    const html =
      '<table><tbody><tr><th>A</th><th>B</th></tr>' +
      '<tr><td colspan="2">wide</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    const editor = make(html);
    expect(grid(editor)).toEqual([['H:A', 'H:B'], ['wide'], ['1', '2']]);
    const again = make(editor.getHTML());
    expect(again.getHTML()).toBe(editor.getHTML());
    expect(editor.getHTML()).toContain('colspan="2"');
  });

  it('reads which header each <th> is by the HTML rules', () => {
    /** Each cell's header state: 0 none, 1 header row, 2 header column, 3 both. */
    const states = (html: string) =>
      make(html).read(() =>
        $table()
          .getChildren()
          .filter($isTableRowNode)
          .map((row) =>
            row
              .getChildren()
              .filter($isTableCellNode)
              .map((cell) => cell.getHeaderStyles()),
          ),
      );
    const row = '<tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr>';
    // A header row only: its first cell is no header column.
    expect(states(`<table>${row}</table>`)).toEqual([
      [1, 1],
      [0, 0],
    ]);
    expect(states(`<table><thead><tr><th>A</th><td>B</td></tr></thead></table>`)).toEqual([[1, 0]]);
    expect(states('<table><tr><th>A</th><th>B</th></tr></table>')).toEqual([[1, 1]]);
    // A header column only.
    expect(
      states('<table><tr><th>A</th><td>1</td></tr><tr><th>B</th><td>2</td></tr></table>'),
    ).toEqual([
      [2, 0],
      [2, 0],
    ]);
    // Both: the corner is both.
    expect(
      states('<table><tr><th>-</th><th>A</th></tr><tr><th>x</th><td>1</td></tr></table>'),
    ).toEqual([
      [3, 1],
      [2, 0],
    ]);
    // `scope` as HTML means it: col heads a column (a header row), row a row.
    expect(
      states(
        '<table><tr><td>a</td><th scope="col">A</th></tr><tr><th scope="row">x</th><td>1</td></tr></table>',
      ),
    ).toEqual([
      [0, 1],
      [2, 0],
    ]);
    // A lone <th> mid-table heads its column.
    expect(states('<table><tr><td>a</td></tr><tr><td>b</td><th>c</th></tr></table>')).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('a <th> that heads nothing else is a header row cell', () => {
    const doc = new DOMParser().parseFromString(
      '<table><tr><td>a</td></tr><tr><td>b</td><th>c</th></tr></table>',
      'text/html',
    );
    expect(headerState(doc.querySelector('th') as HTMLTableCellElement)).toBe(1);
  });

  it('a header row and column read back as written', () => {
    const editor = make('<p>x</p>');
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertTable(3, 3, { row: true, column: true });
    const again = make(editor.getHTML());
    expect(again.getJSON()).toEqual(editor.getJSON());
  });

  it('drops unsafe cell styles from pasted HTML', () => {
    const editor = make(
      '<table><tr><td style="background-color: url(javascript:alert(1)); position: fixed">a</td></tr></table>',
    );
    expect(editor.getHTML()).not.toMatch(/url|position|javascript/);
  });
});

describe('Table Markdown', () => {
  const MD =
    '| Name | Notes |\n| --- | --- |\n| **Ada** | first \\| only<br>second |\n| Bob | `x` |';

  it('reads a GFM table, header row and inline formats', () => {
    const editor = make(MD, 'markdown');
    expect(grid(editor)).toEqual([
      ['H:Name', 'H:Notes'],
      // A line break in a cell reads back as a new paragraph in it.
      ['Ada', 'first | only\n\nsecond'],
      ['Bob', 'x'],
    ]);
    expect(editor.getHTML()).toContain('<strong');
  });

  it('writes it back the same', () => {
    const editor = make(MD, 'markdown');
    expect(editor.getMarkdown()).toBe(MD);
  });

  it('a table without a header row has no divider line', () => {
    const editor = make('| a | b |\n| c | d |', 'markdown');
    expect(grid(editor)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(editor.getMarkdown()).toBe('| a | b |\n| c | d |');
  });

  it('writes merged cells into their first slot, keeping the columns in line', () => {
    const editor = make(
      '<table><tr><th>A</th><th>B</th><th>C</th></tr>' +
        '<tr><td colspan="2">wide</td><td rowspan="2">tall</td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
    expect(editor.getMarkdown()).toBe(
      '| A | B | C |\n| --- | --- | --- |\n| wide |  | tall |\n| 1 | 2 |  |',
    );
  });

  it('pads short rows to the widest one', () => {
    const editor = make('| a | b | c |\n| d |', 'markdown');
    expect(grid(editor)).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
  });

  it('keeps text around the table', () => {
    const editor = make('Before\n\n| a |\n\nAfter', 'markdown');
    expect(editor.getText()).toContain('Before');
    expect(editor.getText()).toContain('After');
    expect(grid(editor)).toEqual([['a']]);
  });
});

describe('scroll edges', () => {
  it('marks the edges a wide table scrolls past, and clears them when it fits', () => {
    // jsdom has no layout: give scroll boxes a width the test controls.
    let width = 900;
    const proto = HTMLElement.prototype;
    const scrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
    const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => width });
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 400 });
    try {
      const editor = make();
      editor.update(() => $getRoot().selectEnd());
      editor.commands.insertTable(2, 2);
      const box = document.querySelector<HTMLElement>('.tei-table-scroll');
      expect(box?.dataset.teiOverflow).toBe('right');
      box!.scrollLeft = 200;
      box!.dispatchEvent(new Event('scroll'));
      expect(box?.dataset.teiOverflow).toBe('left right');
      width = 400;
      editor.commands.appendTableRow();
      expect(box?.dataset.teiOverflow).toBeUndefined();
      // Wide again, then the editor goes: it leaves no mark behind.
      width = 900;
      editor.commands.appendTableRow();
      expect(box?.dataset.teiOverflow).toBe('left right');
      editor.destroy();
      expect(box?.dataset.teiOverflow).toBeUndefined();
    } finally {
      delete (proto as { scrollWidth?: number }).scrollWidth;
      delete (proto as { clientWidth?: number }).clientWidth;
      if (scrollWidth) Object.defineProperty(Element.prototype, 'scrollWidth', scrollWidth);
      if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth);
    }
  });
});
