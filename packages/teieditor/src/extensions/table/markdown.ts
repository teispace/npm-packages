import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type ElementTransformer,
  type Transformer,
} from '@lexical/markdown';
import {
  $computeTableMapSkipCellCheck,
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import { $getEditor, $isParagraphNode, $isTextNode } from 'lexical';
import { TeiEditor } from '../../core/editor.js';

/** `| a | b |`: a row. */
const ROW = /^\|(.+)\|\s?$/;
/** `| --- | :-: |`: the line under the header row. */
const DIVIDER = /^(\| ?:?-+:? ?)+\|\s?$/;
/** A line break inside a cell, as GFM writes it. */
const BREAK = /<br\s*\/?>/gi;

/** Everything else the editor writes and reads in Markdown, for the text inside cells. */
function transformers(): Transformer[] {
  const editor = TeiEditor.of($getEditor());
  return (editor?.markdownTransformers ?? []).filter((t) => t !== TABLE);
}

/** The cells of a row, split on `|` that are not escaped. */
function splitRow(line: string): string[] | null {
  const match = ROW.exec(line.trim());
  if (!match?.[1]) return null;
  const cells: string[] = [];
  let current = '';
  const body = match[1];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && body[i + 1] === '|') {
      current += '|';
      i++;
    } else if (c === '|') {
      cells.push(current.trim());
      current = '';
    } else current += c;
  }
  cells.push(current.trim());
  return cells;
}

function $cell(markdown: string): TableCellNode {
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
  $convertFromMarkdownString(markdown.replace(BREAK, '\n'), transformers(), cell, true);
  return cell;
}

/**
 * GFM tables. Each cell's text keeps its inline Markdown; line breaks in
 * a cell are `<br>` and a `|` in its text is `\|`. A header row is written
 * with the line under it, and that line reads back as a header row.
 */
export const TABLE: ElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node) => {
    if (!$isTableNode(node)) return null;
    const lines: string[] = [];
    // By the table's grid: GFM has no merged cells, so a merged cell's text
    // goes in its first slot and the slots it covers are left empty, which
    // keeps every column in line.
    const [map] = $computeTableMapSkipCellCheck(node, null, null);
    for (const [index, row] of map.entries()) {
      const text = row.map(({ cell, startRow, startColumn }, column) =>
        startRow === index && startColumn === column
          ? $convertToMarkdownString(transformers(), cell, true)
              .replace(/\|/g, '\\|')
              .replace(/\n+/g, '<br>')
              .trim()
          : '',
      );
      lines.push(`| ${text.join(' | ')} |`);
      const header =
        index === 0 && row.every(({ cell }) => cell.hasHeaderState(TableCellHeaderStates.ROW));
      if (header) lines.push(`| ${row.map(() => '---').join(' | ')} |`);
    }
    return lines.join('\n');
  },
  regExp: ROW,
  replace: (parent, _children, match) => {
    // The line under a header row: that row is the header.
    if (DIVIDER.test(match[0])) {
      const table = parent.getPreviousSibling();
      if (!$isTableNode(table)) return false;
      const last = table.getLastChild();
      if (!$isTableRowNode(last)) return false;
      for (const cell of last.getChildren()) {
        if ($isTableCellNode(cell)) {
          cell.setHeaderStyles(TableCellHeaderStates.ROW, TableCellHeaderStates.ROW);
        }
      }
      parent.remove();
      return;
    }
    const first = splitRow(match[0]);
    if (!first) return false;
    // Rows typed or pasted before this one, still paragraphs, join it.
    const rows = [first];
    let sibling = parent.getPreviousSibling();
    while ($isParagraphNode(sibling) && sibling.getChildrenSize() === 1) {
      const text = sibling.getFirstChild();
      const cells = $isTextNode(text) ? splitRow(text.getTextContent()) : null;
      if (!cells) break;
      rows.unshift(cells);
      const previous = sibling.getPreviousSibling();
      sibling.remove();
      sibling = previous;
    }
    // The row before is a table already: these rows are more of it.
    const previous = parent.getPreviousSibling();
    const table = $isTableNode(previous) ? previous : $createTableNode();
    for (const cells of rows) {
      const row = $createTableRowNode();
      for (const text of cells) row.append($cell(text));
      table.append(row);
    }
    // Short rows: Lexical's table transform pads every row to the widest.
    if (table === previous) parent.remove();
    else parent.replace(table);
    table.selectEnd();
  },
  type: 'element',
};
