import { configExtension, effect, getExtensionDependencyFromEditor } from '@lexical/extension';
import { DOMImportExtension } from '@lexical/html';
import {
  $computeTableMapSkipCellCheck,
  $createTableNodeWithDimensions,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findCellNode,
  $findTableNode,
  $getNodeTriplet,
  $getTableColumnIndexFromTableCellNode,
  $insertTableColumnAtNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtNode,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $isTableSelection,
  $mergeCells,
  $setTableColumnIsHeader,
  $setTableRowIsHeader,
  $unmergeCell,
  TableCellHeaderStates,
  type TableCellNode,
  TableExtension,
  type TableNode,
} from '@lexical/table';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_TAB_COMMAND,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension, getExtensionOptions, type TeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import {
  alignBottom,
  alignMiddle,
  alignTop,
  chevronDown,
  columnLeft,
  columnRight,
  deleteColumn,
  deleteRow,
  freeze,
  headerColumn,
  headerRow,
  mergeCells,
  paintBucket,
  plus,
  rowAbove,
  rowBelow,
  splitCells,
  stripes,
  table as tableIcon,
  trash,
} from '../../icons/index.js';
import { isSafeStyleValue } from '../../utils/style-values.js';
import { RichText } from '../rich-text/index.js';
import { markTableHeaders } from './header-import.js';
import { TABLE } from './markdown.js';
import { registerTableOverflow } from './overflow.js';

export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /**
     * Insert a table at the selection, the caret in its first cell.
     * Defaults from the options: size, and a header row.
     */
    insertTable: [rows?: number, columns?: number, headers?: { row?: boolean; column?: boolean }];
    /** Add a row at the end of the table at the selection, or the one with `key`. */
    appendTableRow: [key?: NodeKey];
    /** Add a column at the end of the table at the selection, or the one with `key`. */
    appendTableColumn: [key?: NodeKey];
    addRowBefore: [];
    addRowAfter: [];
    addColumnBefore: [];
    addColumnAfter: [];
    /** Delete the selected rows; the last row takes the table with it. */
    deleteRow: [];
    /** Delete the selected columns; the last column takes the table with it. */
    deleteColumn: [];
    deleteTable: [];
    toggleHeaderRow: [];
    toggleHeaderColumn: [];
    /** Merge the selected cells into one. */
    mergeCells: [];
    /** Split a merged cell back into one cell per slot. */
    splitCell: [];
    /** Colour the selected cells; `null` takes it off. */
    setCellBackground: [color: string | null];
    setCellVerticalAlign: [align: CellVerticalAlign];
    /** Shade every other row. */
    toggleRowStriping: [];
    /** Keep the first row in view while the table scrolls. */
    toggleFrozenRow: [];
    /** Keep the first column in view while the table scrolls sideways. */
    toggleFrozenColumn: [];
    /** Set every column's width, in px: the table at the selection, or the one with `key`. */
    setColumnWidths: [widths: readonly number[], key?: NodeKey];
  }
  interface TeiActiveStates {
    /** The selection is in a table. */
    table: [];
    headerRow: [];
    headerColumn: [];
    rowStriping: [];
    frozenRow: [];
    frozenColumn: [];
    /** The selected cells are coloured (this colour, if given). */
    cellBackground: [color?: string];
    cellVerticalAlign: [align: CellVerticalAlign];
  }
}

export interface TableOptions {
  /** Size of a table inserted without one. Default 3 × 3. */
  rows: number;
  columns: number;
  /** New tables start with a header row. Default true. */
  headerRow: boolean;
  /** New tables start with a header column. Default false. */
  headerColumn: boolean;
  /** The most rows and columns a table can be inserted with. Default 50 × 20. */
  maxRows: number;
  maxColumns: number;
  /** Cells can be merged (colspan and rowspan). Default true. */
  cellMerge: boolean;
  /** Cells can be coloured. Default true. */
  cellBackground: boolean;
  /** Tables inside table cells. Default false. */
  nestedTables: boolean;
  /** Columns can be resized by dragging their edge. Default true. */
  resizable: boolean;
  /** The narrowest a column can be dragged, in px. Default 48. */
  minColumnWidth: number;
  /** Tab in the last cell adds a row, as in a spreadsheet. Default true. */
  tabAddsRow: boolean;
  /** Cell colours on offer, besides none. */
  cellColors: ReadonlyArray<{ value: string; label: string }>;
}

const CELL_COLORS: TableOptions['cellColors'] = [
  { value: 'rgb(239 68 68 / 0.18)', label: 'Red' },
  { value: 'rgb(249 115 22 / 0.18)', label: 'Orange' },
  { value: 'rgb(234 179 8 / 0.22)', label: 'Yellow' },
  { value: 'rgb(34 197 94 / 0.18)', label: 'Green' },
  { value: 'rgb(59 130 246 / 0.18)', label: 'Blue' },
  { value: 'rgb(168 85 247 / 0.18)', label: 'Purple' },
  { value: 'rgb(236 72 153 / 0.18)', label: 'Pink' },
  { value: 'rgb(120 113 108 / 0.18)', label: 'Grey' },
];

/** Where the selection is in a table: the cell it starts in, and every selected cell. */
export interface TableAtSelection {
  table: TableNode;
  cell: TableCellNode;
  cells: TableCellNode[];
}

/** The table the selection is in, innermost first: a caret in a cell, or a cell selection. */
export function $getTableAtSelection(): TableAtSelection | null {
  const selection = $getSelection();
  if ($isTableSelection(selection)) {
    const cells = selection.getNodes().filter($isTableCellNode);
    const [cell, , table] = $getNodeTriplet(selection.anchor);
    return { table, cell, cells: cells.length > 0 ? cells : [cell] };
  }
  if (!$isRangeSelection(selection)) return null;
  const cell = $findCellNode(selection.anchor.getNode());
  if (!cell) return null;
  const table = $findTableNode(cell);
  return table ? { table, cell, cells: [cell] } : null;
}

const $inTable = () => $getTableAtSelection() !== null;

/** The table with this key, or the one at the selection. */
function $tableByKey(key?: NodeKey): TableNode | null {
  if (key === undefined) return $getTableAtSelection()?.table ?? null;
  const node = $getNodeByKey(key);
  return $isTableNode(node) ? node : null;
}

/** Every cell of a row (by index) or a column, as the grid has them. */
function $line(table: TableNode, kind: 'row' | 'column', index: number): TableCellNode[] {
  const rows = table.getChildren().filter($isTableRowNode);
  if (kind === 'row') return (rows[index]?.getChildren() ?? []).filter($isTableCellNode);
  return rows.map((row) => row.getChildren().filter($isTableCellNode)[index]).filter(Boolean);
}

function $isHeaderLine(table: TableNode, kind: 'row' | 'column'): boolean {
  const cells = $line(table, kind, 0);
  const state = kind === 'row' ? TableCellHeaderStates.ROW : TableCellHeaderStates.COLUMN;
  return cells.length > 0 && cells.every((cell) => cell.hasHeaderState(state));
}

/** Remove a table, leaving the caret where it was. */
function $removeTable(table: TableNode): void {
  const next = table.getNextSibling();
  const previous = table.getPreviousSibling();
  table.remove();
  if (next) next.selectStart();
  else if (previous) previous.selectEnd();
  else {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.select();
  }
}

/**
 * A column beside the caret's cell, the caret staying where it is (as a row
 * insert leaves it); Lexical's own moves it to the new column's top cell. A
 * cell selection goes to Lexical, which inserts beside its edge.
 */
function $insertColumn(after: boolean): boolean {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const cell = $findCellNode(selection.anchor.getNode());
    return cell !== null && $insertTableColumnAtNode(cell, after, false) !== null;
  }
  return $inTable() && $insertTableColumnAtSelection(after) !== null;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(n)));

/** Every selected cell, each once, in a table where cells may be merged. */
const $cells = () => $getTableAtSelection()?.cells ?? [];

/** An item shown only while a switch in the options is on. */
const option =
  (key: 'cellMerge' | 'cellBackground') =>
  (editor: TeiEditor): boolean =>
    self ? Boolean(getExtensionOptions(editor, self)?.[key]) : false;
/** The extension itself, for its items to read its options. */
let self: TeiExtension<string, TableOptions, undefined> | undefined;

const tableItem = (item: Omit<TeiItem, 'in'> & { in?: TeiItem['in'] }): TeiItem => ({
  in: ['tableMenu'],
  ...item,
});

/**
 * Tables: insert one from the toolbar's grid, the slash menu or `| a | b |`
 * in Markdown; add, delete and move between rows and columns; header rows
 * and columns; merged cells; cell colours and alignment; striped rows;
 * frozen first row and column; columns resized by dragging. Saved as
 * `<table>` in HTML and as GFM tables in Markdown.
 *
 * In React, `<Editor>` adds the menu on the cell with the caret, the + bars
 * at the table's end and edge, and the column resize handles.
 */
export const Table = defineTeiExtension({
  name: '@teispace/teieditor/table',
  config: {
    rows: 3,
    columns: 3,
    headerRow: true,
    headerColumn: false,
    maxRows: 50,
    maxColumns: 20,
    cellMerge: true,
    cellBackground: true,
    nestedTables: false,
    resizable: true,
    minColumnWidth: 48,
    tabAddsRow: true,
    cellColors: CELL_COLORS,
  } as TableOptions,
  dependencies: [
    RichText,
    TableExtension,
    configExtension(DOMImportExtension, { preprocess: [markTableHeaders] }),
  ],
  markdown: { table: TABLE },
  register: ({ lexical, options }) => {
    // Lexical's own table switches follow these options, live.
    const lexicalTable = getExtensionDependencyFromEditor(lexical, TableExtension).output;
    const stopOptions = effect(() => {
      lexicalTable.hasCellMerge.value = options.cellMerge;
      lexicalTable.hasCellBackgroundColor.value = options.cellBackground;
      lexicalTable.hasNestedTables.value = options.nestedTables;
    });
    // A table wider than the page fades at the edges it scrolls past.
    const stopOverflow = registerTableOverflow(lexical);
    // Before Lexical's own Tab, which stops at the last cell.
    const stopTab = lexical.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (event.shiftKey || !options.tabAddsRow) return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
        const cell = $findCellNode(selection.anchor.getNode());
        const table = cell && $findTableNode(cell);
        if (!cell || !table) return false;
        const [map] = $computeTableMapSkipCellCheck(table, null, null);
        const last = map.at(-1);
        if (last?.at(-1)?.cell !== cell) return false;
        const row = $insertTableRowAtNode(cell, true);
        if (!row) return false;
        event.preventDefault();
        row.getFirstDescendant()?.selectStart();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    return () => {
      stopOptions();
      stopOverflow();
      stopTab();
    };
  },
  commands: {
    insertTable: {
      run: ({ options }, rows?: number, columns?: number, headers?) => {
        const selection = $getSelection() ?? $getPreviousSelection();
        if (!$isRangeSelection(selection)) return false;
        if (!options.nestedTables && $findTableNode(selection.anchor.getNode())) return false;
        const table = $createTableNodeWithDimensions(
          clamp(rows ?? options.rows, 1, options.maxRows),
          clamp(columns ?? options.columns, 1, options.maxColumns),
          {
            rows: headers?.row ?? options.headerRow,
            columns: headers?.column ?? options.headerColumn,
          },
        );
        $insertNodeToNearestRoot(table);
        table.getFirstDescendant()?.selectStart();
        return true;
      },
      can: ({ options }) => {
        const selection = $getSelection();
        return (
          $isRangeSelection(selection) &&
          (options.nestedTables || !$findTableNode(selection.anchor.getNode()))
        );
      },
    },
    appendTableRow: {
      run: (_ctx, key?: NodeKey) => {
        const table = $tableByKey(key);
        const last = table?.getLastChild();
        const cell = $isTableRowNode(last) ? last.getFirstChild() : null;
        return $isTableCellNode(cell) && $insertTableRowAtNode(cell, true) !== null;
      },
      can: (_ctx, key?: NodeKey) => $tableByKey(key) !== null,
    },
    appendTableColumn: {
      run: (_ctx, key?: NodeKey) => {
        const table = $tableByKey(key);
        const first = table?.getFirstChild();
        const cell = $isTableRowNode(first) ? first.getLastChild() : null;
        return $isTableCellNode(cell) && $insertTableColumnAtNode(cell, true, false) !== null;
      },
      can: (_ctx, key?: NodeKey) => $tableByKey(key) !== null,
    },
    addRowBefore: { run: () => $inTable() && !!$insertTableRowAtSelection(false), can: $inTable },
    addRowAfter: { run: () => $inTable() && !!$insertTableRowAtSelection(true), can: $inTable },
    addColumnBefore: { run: () => $insertColumn(false), can: $inTable },
    addColumnAfter: { run: () => $insertColumn(true), can: $inTable },
    deleteRow: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        const rows = at.table.getChildrenSize();
        const selected = new Set(at.cells.map((cell) => cell.getParent()?.getKey()));
        if (selected.size >= rows) $removeTable(at.table);
        else $deleteTableRowAtSelection();
      },
      can: $inTable,
    },
    deleteColumn: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        const selected = new Set(at.cells.map($getTableColumnIndexFromTableCellNode));
        if (selected.size >= at.table.getColumnCount()) $removeTable(at.table);
        else $deleteTableColumnAtSelection();
      },
      can: $inTable,
    },
    deleteTable: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        $removeTable(at.table);
      },
      can: $inTable,
    },
    toggleHeaderRow: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        $setTableRowIsHeader(at.table, 0, !$isHeaderLine(at.table, 'row'));
      },
      can: $inTable,
    },
    toggleHeaderColumn: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        $setTableColumnIsHeader(at.table, 0, !$isHeaderLine(at.table, 'column'));
      },
      can: $inTable,
    },
    mergeCells: {
      run: ({ options }) => {
        const at = $getTableAtSelection();
        if (!options.cellMerge || !at || at.cells.length < 2) return false;
        return $mergeCells(at.cells) !== null;
      },
      can: ({ options }) => {
        const at = $getTableAtSelection();
        return options.cellMerge && at !== null && at.cells.length > 1;
      },
    },
    splitCell: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at || !isMerged(at.cell)) return false;
        $unmergeCell();
      },
      can: () => {
        const at = $getTableAtSelection();
        return at !== null && at.cells.length === 1 && isMerged(at.cell);
      },
    },
    setCellBackground: {
      run: ({ options }, color: string | null) => {
        const cells = $cells();
        if (!options.cellBackground || cells.length === 0) return false;
        if (color !== null && !isSafeStyleValue('background-color', color)) return false;
        for (const cell of cells) cell.setBackgroundColor(color);
      },
      can: ({ options }) => options.cellBackground && $inTable(),
    },
    setCellVerticalAlign: {
      run: (_ctx, align: CellVerticalAlign) => {
        const cells = $cells();
        if (cells.length === 0 || !VERTICAL.has(align)) return false;
        for (const cell of cells) cell.setVerticalAlign(align === 'top' ? null : align);
      },
      can: $inTable,
    },
    toggleRowStriping: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        at.table.setRowStriping(!at.table.getRowStriping());
      },
      can: $inTable,
    },
    toggleFrozenRow: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        at.table.setFrozenRows(at.table.getFrozenRows() > 0 ? 0 : 1);
      },
      can: $inTable,
    },
    toggleFrozenColumn: {
      run: () => {
        const at = $getTableAtSelection();
        if (!at) return false;
        at.table.setFrozenColumns(at.table.getFrozenColumns() > 0 ? 0 : 1);
      },
      can: $inTable,
    },
    setColumnWidths: {
      run: ({ options }, widths: readonly number[], key?: NodeKey) => {
        const node = $tableByKey(key);
        if (!node || !options.resizable) return false;
        if (widths.length !== node.getColumnCount() || !widths.every(Number.isFinite)) return false;
        node.setColWidths(widths.map((w) => Math.max(options.minColumnWidth, Math.round(w))));
      },
      can: ({ options }, _widths: readonly number[], key?: NodeKey) =>
        options.resizable && $tableByKey(key) !== null,
    },
  },
  active: {
    table: $inTable,
    headerRow: () => {
      const at = $getTableAtSelection();
      return at !== null && $isHeaderLine(at.table, 'row');
    },
    headerColumn: () => {
      const at = $getTableAtSelection();
      return at !== null && $isHeaderLine(at.table, 'column');
    },
    rowStriping: () => $getTableAtSelection()?.table.getRowStriping() ?? false,
    frozenRow: () => ($getTableAtSelection()?.table.getFrozenRows() ?? 0) > 0,
    frozenColumn: () => ($getTableAtSelection()?.table.getFrozenColumns() ?? 0) > 0,
    cellBackground: (_ctx, color?: string) => {
      const cells = $cells();
      if (cells.length === 0) return false;
      return cells.every((cell) => {
        const value = cell.getBackgroundColor();
        return color === undefined ? value !== null : value === color;
      });
    },
    cellVerticalAlign: (_ctx, align: CellVerticalAlign) => {
      const cells = $cells();
      return (
        cells.length > 0 && cells.every((cell) => (cell.getVerticalAlign() || 'top') === align)
      );
    },
  },
  icons: {
    table: tableIcon,
    rowAbove,
    rowBelow,
    columnLeft,
    columnRight,
    deleteRow,
    deleteColumn,
    trash,
    headerRow,
    headerColumn,
    mergeCells,
    splitCells,
    paintBucket,
    alignTop,
    alignMiddle,
    alignBottom,
    stripes,
    freeze,
    plus,
    chevronDown,
  },
  messages: {
    'table.insert': 'Table',
    'table.insert.description': 'Rows and columns',
    'table.insertSize': 'Insert a {rows} × {columns} table',
    'table.menu': 'Table',
    'table.cellMenu': 'Cell options',
    'table.addRowBefore': 'Insert row above',
    'table.addRowAfter': 'Insert row below',
    'table.addColumnBefore': 'Insert column left',
    'table.addColumnAfter': 'Insert column right',
    'table.addRow': 'Add a row',
    'table.addColumn': 'Add a column',
    'table.deleteRow': 'Delete row',
    'table.deleteColumn': 'Delete column',
    'table.deleteTable': 'Delete table',
    'table.headerRow': 'Header row',
    'table.headerColumn': 'Header column',
    'table.mergeCells': 'Merge cells',
    'table.splitCell': 'Split cell',
    'table.cellBackground': 'Cell colour',
    'table.cellBackground.none': 'None',
    'table.verticalAlign': 'Vertical align',
    'table.verticalAlign.top': 'Top',
    'table.verticalAlign.middle': 'Middle',
    'table.verticalAlign.bottom': 'Bottom',
    'table.rowStriping': 'Striped rows',
    'table.frozenRow': 'Freeze first row',
    'table.frozenColumn': 'Freeze first column',
    'table.resizeColumn': 'Resize column',
  },
  items: [
    {
      id: 'insertTable',
      label: 'table.insert',
      description: 'table.insert.description',
      icon: 'table',
      in: ['toolbar', 'slash', 'insert'],
      group: 'insert',
      order: 20,
      keywords: ['table', 'grid', 'rows', 'columns', 'spreadsheet'],
      command: 'insertTable',
      control: 'insertTable',
    },
    tableItem({
      id: 'addRowBefore',
      label: 'table.addRowBefore',
      icon: 'rowAbove',
      group: 'row',
      order: 0,
      command: 'addRowBefore',
    }),
    tableItem({
      id: 'addRowAfter',
      label: 'table.addRowAfter',
      icon: 'rowBelow',
      group: 'row',
      order: 1,
      command: 'addRowAfter',
    }),
    tableItem({
      id: 'headerRow',
      label: 'table.headerRow',
      icon: 'headerRow',
      group: 'row',
      order: 2,
      command: 'toggleHeaderRow',
      active: 'headerRow',
    }),
    tableItem({
      id: 'deleteRow',
      label: 'table.deleteRow',
      icon: 'deleteRow',
      group: 'row',
      order: 3,
      command: 'deleteRow',
    }),
    tableItem({
      id: 'addColumnBefore',
      label: 'table.addColumnBefore',
      icon: 'columnLeft',
      group: 'column',
      order: 0,
      command: 'addColumnBefore',
    }),
    tableItem({
      id: 'addColumnAfter',
      label: 'table.addColumnAfter',
      icon: 'columnRight',
      group: 'column',
      order: 1,
      command: 'addColumnAfter',
    }),
    tableItem({
      id: 'headerColumn',
      label: 'table.headerColumn',
      icon: 'headerColumn',
      group: 'column',
      order: 2,
      command: 'toggleHeaderColumn',
      active: 'headerColumn',
    }),
    tableItem({
      id: 'deleteColumn',
      label: 'table.deleteColumn',
      icon: 'deleteColumn',
      group: 'column',
      order: 3,
      command: 'deleteColumn',
    }),
    tableItem({
      id: 'mergeCells',
      label: 'table.mergeCells',
      icon: 'mergeCells',
      group: 'cell',
      order: 0,
      command: 'mergeCells',
      visible: option('cellMerge'),
    }),
    tableItem({
      id: 'splitCell',
      label: 'table.splitCell',
      icon: 'splitCells',
      group: 'cell',
      order: 1,
      command: 'splitCell',
      visible: option('cellMerge'),
    }),
    tableItem({
      id: 'cellBackground',
      label: 'table.cellBackground',
      icon: 'paintBucket',
      group: 'cell',
      order: 2,
      control: 'cellBackground',
      active: 'cellBackground',
      visible: option('cellBackground'),
    }),
    tableItem({
      id: 'verticalAlign',
      label: 'table.verticalAlign',
      icon: 'alignMiddle',
      group: 'cell',
      order: 3,
      control: 'cellVerticalAlign',
    }),
    tableItem({
      id: 'rowStriping',
      label: 'table.rowStriping',
      icon: 'stripes',
      group: 'table',
      order: 0,
      command: 'toggleRowStriping',
      active: 'rowStriping',
    }),
    tableItem({
      id: 'frozenRow',
      label: 'table.frozenRow',
      icon: 'freeze',
      group: 'table',
      order: 1,
      command: 'toggleFrozenRow',
      active: 'frozenRow',
    }),
    tableItem({
      id: 'frozenColumn',
      label: 'table.frozenColumn',
      icon: 'freeze',
      group: 'table',
      order: 2,
      command: 'toggleFrozenColumn',
      active: 'frozenColumn',
    }),
    tableItem({
      id: 'deleteTable',
      label: 'table.deleteTable',
      icon: 'trash',
      group: 'table',
      order: 3,
      command: 'deleteTable',
    }),
  ],
});

self = Table;

const VERTICAL: ReadonlySet<string> = new Set(['top', 'middle', 'bottom']);

const isMerged = (cell: TableCellNode) => cell.getColSpan() > 1 || cell.getRowSpan() > 1;

export { TABLE as TABLE_MARKDOWN } from './markdown.js';
