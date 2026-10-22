import type { DOMPreprocessFn } from '@lexical/html';
import { TableCellHeaderStates } from '@lexical/table';

const isHeader = (cell: Element | null | undefined) => cell?.nodeName === 'TH';

const isHeaderRow = (row: HTMLTableRowElement) =>
  row.parentElement?.nodeName === 'THEAD' || [...row.cells].every(isHeader);

/**
 * Which header a `<th>` is, by the HTML rules: `scope` when it has one,
 * else a row of all `<th>` (or one in `<thead>`) is a header row, and a
 * first column that is `<th>` in every other row is a header column. A
 * lone `<th>` heads its column, as browsers read it.
 */
export function headerState(th: HTMLTableCellElement): number {
  const scope = th.getAttribute('scope')?.toLowerCase();
  if (scope === 'col' || scope === 'colgroup') return TableCellHeaderStates.ROW;
  if (scope === 'row' || scope === 'rowgroup') return TableCellHeaderStates.COLUMN;
  const row = th.parentElement as HTMLTableRowElement | null;
  if (!row?.cells) return TableCellHeaderStates.ROW;
  const inHeaderRow = isHeaderRow(row);
  // The rows under the header rows decide the column: a table that is all
  // header row has no header column.
  const body = [...(th.closest('table')?.rows ?? [])].filter((r) => !isHeaderRow(r));
  const inHeaderColumn =
    th.cellIndex === 0 && body.length > 0 && body.every((r) => isHeader(r.cells[0]));
  let state = TableCellHeaderStates.NO_STATUS;
  if (inHeaderRow) state |= TableCellHeaderStates.ROW;
  if (inHeaderColumn) state |= TableCellHeaderStates.COLUMN;
  return state || TableCellHeaderStates.ROW;
}

/**
 * Lexical's import makes every `<th>` in the first column a header column
 * as well, so a table with only a header row reads back with a header cell
 * in its first column; and it reads `scope="col"` as a header column. This
 * runs first and spells each `<th>` out for it, in the `scope` Lexical
 * reads (its `row` is a header row); a corner of both keeps none, which
 * Lexical reads as both.
 */
export const markTableHeaders: DOMPreprocessFn = (dom, _ctx, $next) => {
  const cells = Array.from(dom.querySelectorAll<HTMLTableCellElement>('th'));
  const states = cells.map(headerState);
  cells.forEach((th, i) => {
    const state = states[i];
    if (state === TableCellHeaderStates.ROW) th.setAttribute('scope', 'row');
    else if (state === TableCellHeaderStates.COLUMN) th.setAttribute('scope', 'col');
    else th.removeAttribute('scope');
  });
  $next();
};
