'use client';

import {
  $computeTableMapSkipCellCheck,
  $getTableCellNodeRect,
  $isTableCellNode,
  $isTableNode,
  $isTableSelection,
  type TableCellNode,
} from '@lexical/table';
import { $getNearestNodeFromDOMNode, $getNodeByKey, $getSelection, type NodeKey } from 'lexical';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import {
  $getTableAtSelection,
  type CellVerticalAlign,
  Table,
} from '../../extensions/table/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { hoverNow } from '../hover-now.js';
import { useItemStates } from '../items.js';
import { Button } from '../ui/button.js';
import { GridPicker } from '../ui/controls.js';
import { DropdownMenu } from '../ui/dropdown.js';
import type { FloatingAnchor, VirtualElement } from '../ui/floating.js';
import { Menu, type MenuGroupData, type MenuItemData } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import type { ToolbarSubmenu } from './editor-toolbar.js';

// -- Insert -------------------------------------------------------------------

const SIZES: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
];

/** A toolbar button that opens a grid: hover or arrow to a size, click or Enter to insert. */
export function InsertTableMenu({ editor }: { editor: TeiEditor }) {
  const enabled = useEditorState((e) => e.can().insertTable(), { editor });
  const options = getExtensionOptions(editor, Table);
  if (!options) return null;
  const label = editor.t('table.insert');
  return (
    <DropdownMenu
      data-item="insertTable"
      data-tei-control="insertTable"
      icon="table"
      label={label}
      aria-label={label}
      menuLabel={label}
      disabled={!enabled}
      content={(close) => (
        <GridPicker
          rows={Math.min(8, options.maxRows)}
          columns={Math.min(10, options.maxColumns)}
          formatCaption={(rows, columns) => `${rows} × ${columns}`}
          onPick={(rows, columns) => {
            close();
            editor.chain().focus().insertTable(rows, columns).run();
          }}
        />
      )}
    />
  );
}

InsertTableMenu.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => ({
  label: editor.t('table.insert'),
  icon: 'table',
  items: SIZES.map(
    ([rows, columns]): TeiItem => ({
      id: `insertTable-${rows}x${columns}`,
      label: `${rows} × ${columns}`,
      in: [],
      command: 'insertTable',
      args: [rows, columns],
    }),
  ),
});

// -- Shared -------------------------------------------------------------------

/** How long the pointer may be away before hover UI goes, in ms. */
const LEAVE_DELAY = 200;

/** The table cell and table under a DOM node, if any. */
function cellAt(editor: TeiEditor, target: EventTarget | null) {
  if (!(target instanceof Node)) return null;
  return editor.read(() => {
    let node = $getNearestNodeFromDOMNode(target);
    while (node && !$isTableCellNode(node)) node = node.getParent();
    if (!node) return null;
    let table = node.getParent();
    while (table && !$isTableNode(table)) table = table.getParent();
    return table ? { cell: node.getKey(), table: table.getKey() } : null;
  });
}

/** The table element of a table node: the wrapper Lexical may put round it is not it. */
function tableElement(editor: TeiEditor, key: NodeKey): HTMLTableElement | null {
  const element = editor.lexical.getElementByKey(key);
  if (!element) return null;
  return element instanceof HTMLTableElement ? element : element.querySelector('table');
}

/** The table as far as it shows: a table wider than its scroll box ends at the box. */
function visibleTable(editor: TeiEditor, key: NodeKey): VirtualElement | null {
  const table = tableElement(editor, key);
  if (!table) return null;
  const box = editor.lexical.getElementByKey(key) ?? table;
  return {
    contextElement: table,
    getBoundingClientRect: () => {
      const t = table.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const left = Math.max(t.left, b.left);
      const right = Math.min(t.right, b.right);
      return DOMRect.fromRect({ x: left, y: t.top, width: right - left, height: t.height });
    },
  };
}

/** Whether the pointer left for one of the table controls, which float above the table. */
function intoTableControl(event: PointerEvent): boolean {
  const to = event.relatedTarget;
  return to instanceof Element && to.closest('[data-tei-control^="table-"]') !== null;
}

/** A root `pointerleave` listener that runs `leave` unless the pointer went onto a table control. */
const leaveUnlessInto = (leave: () => void) => (event: PointerEvent) => {
  if (!intoTableControl(event)) leave();
};

/** Hover state with a grace period, so the pointer can travel to the UI it shows. */
function useHover<T>() {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    value,
    set: (next: T | null) => {
      clearTimeout(timer.current);
      setValue(next);
    },
    keep: () => clearTimeout(timer.current),
    leave: () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(null), LEAVE_DELAY);
    },
  };
}

/** Listen on the editor's root element, following it as it changes. */
function useRootListener<K extends keyof HTMLElementEventMap>(
  editor: TeiEditor,
  type: K,
  listener: ((event: HTMLElementEventMap[K]) => void) | null,
) {
  const latest = useRef(listener);
  latest.current = listener;
  const on = listener !== null;
  useEffect(() => {
    if (!on) return;
    const handle = (event: HTMLElementEventMap[K]) => latest.current?.(event);
    let current: HTMLElement | null = null;
    const stop = editor.lexical.registerRootListener((root, previous) => {
      previous?.removeEventListener(type, handle);
      root?.addEventListener(type, handle);
      current = root;
      if (root && type === 'pointerover') hoverNow(root, handle as (event: PointerEvent) => void);
    });
    return () => {
      stop();
      current?.removeEventListener(type, handle);
    };
  }, [editor, type, on]);
}

// -- Cell menu ----------------------------------------------------------------

function swatchIcon(color: string | null) {
  return (
    <span
      className="tei-menu-swatch"
      data-empty={color === null ? '' : undefined}
      ref={(el) => {
        if (el && color !== null) el.style.setProperty('--tei-swatch', color);
      }}
    />
  );
}

/** The menu's entries, from the `tableMenu` items: grouped by section, with submenus for the controls. */
function useTableMenu(editor: TeiEditor, onDone: () => void): MenuGroupData[] {
  // Each render: which entries show can follow the options, live.
  const items = editor.items('tableMenu');
  const states = useItemStates(editor, items);
  const extra = useEditorState(
    (e) => ({
      background: e.read(() => {
        const at = $getTableAtSelection();
        const colors = new Set(at?.cells.map((cell) => cell.getBackgroundColor()));
        return colors.size === 1 ? ([...colors][0] ?? null) : undefined;
      }),
      align: (['top', 'middle', 'bottom'] as const).find((a) => e.isActive('cellVerticalAlign', a)),
    }),
    { editor },
  );
  const options = getExtensionOptions(editor, Table);
  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };

  const entry = (item: TeiItem, index: number): MenuItemData => {
    const state = states[index];
    const label = editor.t(item.label);
    if (item.control === 'cellBackground') {
      const none = editor.t('table.cellBackground.none');
      return {
        id: item.id,
        label,
        icon: item.icon,
        disabled: !state?.enabled,
        items: [
          { value: null, label: none },
          ...(options?.cellColors ?? []).map((c) => ({ value: c.value, label: c.label })),
        ].map((color) => ({
          id: `cellBackground-${color.label}`,
          label: color.label,
          icon: swatchIcon(color.value),
          checked: extra.background === color.value,
          radio: true,
          onSelect: run(() => editor.chain().focus().setCellBackground(color.value).run()),
        })),
      };
    }
    if (item.control === 'cellVerticalAlign') {
      return {
        id: item.id,
        label,
        icon: item.icon,
        disabled: !state?.enabled,
        items: (['top', 'middle', 'bottom'] as const satisfies readonly CellVerticalAlign[]).map(
          (align) => ({
            id: `verticalAlign-${align}`,
            label: editor.t(`table.verticalAlign.${align}`),
            icon: `align${align[0]?.toUpperCase()}${align.slice(1)}`,
            checked: extra.align === align,
            radio: true,
            onSelect: run(() => editor.chain().focus().setCellVerticalAlign(align).run()),
          }),
        ),
      };
    }
    return {
      id: item.id,
      label,
      icon: item.icon,
      checked: item.active ? Boolean(state?.active) : undefined,
      disabled: !state?.enabled,
      variant: item.id === 'deleteTable' ? 'danger' : undefined,
      onSelect: run(() => {
        editor.runItem(item);
        editor.focus();
      }),
    };
  };

  const groups: MenuGroupData[] = [];
  items.forEach((item, index) => {
    const id = item.group ?? 'other';
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = { id, items: [] };
      groups.push(group);
    }
    (group.items as MenuItemData[]).push(entry(item, index));
  });
  return groups;
}

/** Put the caret in a cell, unless a cell selection already covers it. */
function selectCell(editor: TeiEditor, key: NodeKey) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isTableSelection(selection) && selection.getNodes().some((n) => n.getKey() === key)) {
      return;
    }
    const cell = $getNodeByKey(key);
    if ($isTableCellNode(cell)) cell.selectEnd();
  });
}

function TableCellMenu({ editor }: { editor: TeiEditor }) {
  const focused = useEditorFocus(editor);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const caret = useEditorState((e) => e.read(() => $getTableAtSelection()?.cell.getKey() ?? null), {
    editor,
  });
  const hover = useHover<NodeKey>();
  const [menu, setMenu] = useState<{ anchor: FloatingAnchor; key: NodeKey } | null>(null);
  // The cell whose handle is being pressed: a tap blurs the editor (iOS)
  // before the click, and the handle must stay for it.
  const [held, setHeld] = useState<NodeKey | null>(null);
  const close = () => setMenu(null);
  const groups = useTableMenu(editor, close);

  useRootListener(
    editor,
    'pointerover',
    editable
      ? (event) => {
          if (event.pointerType === 'touch') return;
          const at = cellAt(editor, event.target);
          if (at) hover.set(at.cell);
          else hover.leave();
        }
      : null,
  );
  useRootListener(editor, 'pointerleave', editable ? leaveUnlessInto(hover.leave) : null);
  // Right-click in a cell opens the same menu at the pointer.
  useRootListener(
    editor,
    'contextmenu',
    editable
      ? (event) => {
          const at = cellAt(editor, event.target);
          if (!at) return;
          event.preventDefault();
          selectCell(editor, at.cell);
          const { clientX: x, clientY: y } = event;
          setMenu({
            key: at.cell,
            anchor: {
              getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }),
            },
          });
        }
      : null,
  );

  const key = menu?.key ?? held ?? hover.value ?? (focused ? caret : null);
  const cell = key ? editor.lexical.getElementByKey(key) : null;
  if (!editable || !cell || !key) return null;
  const label = editor.t('table.cellMenu');

  return (
    <>
      <Popover
        open
        anchor={cell}
        placement="top-end"
        inside
        offset={3}
        variant="bar"
        dismissOnOutside={false}
        data-tei-control="table-cell-handle"
        onPointerEnter={hover.keep}
        onPointerLeave={hover.leave}
      >
        <Button
          size="sm"
          icon="chevronDown"
          label={label}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          data-tei-control="table-cell-menu"
          onPointerDown={() => setHeld(key)}
          onPointerCancel={() => setHeld(null)}
          onClick={(event) => {
            setHeld(null);
            selectCell(editor, key);
            setMenu(menu ? null : { key, anchor: event.currentTarget });
          }}
        />
      </Popover>
      {menu && (
        <Popover
          open
          anchor={menu.anchor}
          placement={menu.anchor instanceof Element ? 'bottom-end' : 'bottom-start'}
          restoreFocus={false}
          initialFocus="container"
          onDismiss={(reason) => {
            close();
            if (reason === 'escape') editor.focus();
          }}
          data-tei-control="table-menu"
        >
          <Menu groups={groups} label={editor.t('table.menu')} onClose={close} />
        </Popover>
      )}
    </>
  );
}

// -- Add bars -----------------------------------------------------------------

function TableAddBars({ editor }: { editor: TeiEditor }) {
  const editable = useEditorState((e) => e.isEditable, { editor });
  const hover = useHover<NodeKey>();
  useRootListener(
    editor,
    'pointerover',
    editable
      ? (event) => {
          if (event.pointerType === 'touch') return;
          const at = cellAt(editor, event.target);
          if (at) hover.set(at.table);
          else hover.leave();
        }
      : null,
  );
  useRootListener(editor, 'pointerleave', editable ? leaveUnlessInto(hover.leave) : null);

  const key = hover.value;
  // Re-read the table on each document change: rows come and go under the pointer.
  useEditorState((e) => (key ? e.read(() => $getNodeByKey(key)?.getLatest()) : null), { editor });
  const anchor = useMemo(() => (key ? visibleTable(editor, key) : null), [editor, key]);
  if (!editable || !key || !anchor || !editor.lexical.getElementByKey(key)) return null;

  const bar = (kind: 'row' | 'column') => (
    <Popover
      open
      anchor={anchor}
      placement={kind === 'row' ? 'bottom' : 'right'}
      offset={4}
      noFlip
      matchWidth={kind === 'row'}
      matchHeight={kind === 'column'}
      dismissOnOutside={false}
      className="tei-table-add"
      data-kind={kind}
      data-tei-control={`table-add-${kind}`}
      onPointerEnter={hover.keep}
      onPointerLeave={hover.leave}
    >
      <Button
        size="sm"
        icon="plus"
        label={editor.t(kind === 'row' ? 'table.addRow' : 'table.addColumn')}
        onClick={() =>
          kind === 'row'
            ? editor.commands.appendTableRow(key)
            : editor.commands.appendTableColumn(key)
        }
      />
    </Popover>
  );
  return (
    <>
      {bar('row')}
      {bar('column')}
    </>
  );
}

// -- Column resizer -----------------------------------------------------------

/** How near a column's edge, in px, the pointer picks it up. */
const EDGE = 5;

interface Edge {
  table: NodeKey;
  /** The column whose end edge it is. */
  column: number;
}

/** Each column's width, from a cell spanning only it; columns no such cell covers share. */
function measureColumns(editor: TeiEditor, key: NodeKey): number[] | null {
  return editor.read(() => {
    const table = $getNodeByKey(key);
    if (!$isTableNode(table)) return null;
    const [map] = $computeTableMapSkipCellCheck(table, null, null);
    const count = map[0]?.length ?? 0;
    const widths: number[] = [];
    for (let c = 0; c < count; c++) {
      let width: number | undefined;
      for (const row of map) {
        const cell = row[c]?.cell as TableCellNode | undefined;
        if (cell && cell.getColSpan() === 1) {
          const element = editor.lexical.getElementByKey(cell.getKey());
          if (element) {
            width = element.getBoundingClientRect().width;
            break;
          }
        }
      }
      widths.push(width ?? Number.NaN);
    }
    const known = widths.filter(Number.isFinite);
    const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 120;
    return widths.map((w) => (Number.isFinite(w) ? w : fallback));
  });
}

function TableColumnResizer({ editor }: { editor: TeiEditor }) {
  const options = getExtensionOptions(editor, Table);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const [edge, setEdge] = useState<Edge | null>(null);
  const [dragging, setDragging] = useState(false);
  const handle = useRef<HTMLDivElement>(null);
  const on = editable && Boolean(options?.resizable);

  useRootListener(
    editor,
    'pointermove',
    on && !dragging
      ? (event) => {
          if (event.pointerType === 'touch') return;
          const target = event.target instanceof Element ? event.target.closest('td,th') : null;
          const at = target ? cellAt(editor, target) : null;
          if (!target || !at) {
            setEdge(null);
            return;
          }
          const rect = target.getBoundingClientRect();
          const rtl = getComputedStyle(target).direction === 'rtl';
          const end = rtl ? rect.left : rect.right;
          const start = rtl ? rect.right : rect.left;
          const nearEnd = Math.abs(event.clientX - end) <= EDGE;
          const nearStart = Math.abs(event.clientX - start) <= EDGE;
          if (!nearEnd && !nearStart) {
            setEdge(null);
            return;
          }
          const position = editor.read(() => {
            const cell = $getNodeByKey(at.cell);
            return $isTableCellNode(cell) ? $getTableCellNodeRect(cell) : null;
          });
          if (!position) return;
          // The start edge of a cell is the end edge of the column before it.
          const column = nearEnd
            ? position.columnIndex + position.colSpan - 1
            : position.columnIndex - 1;
          setEdge(column >= 0 ? { table: at.table, column } : null);
        }
      : null,
  );
  useRootListener(
    editor,
    'pointerleave',
    on && !dragging
      ? (event) => {
          // Onto the handle, which shows right under the pointer: still the edge.
          if (!intoTableControl(event)) setEdge(null);
        }
      : null,
  );

  // Place the handle over the edge, through the CSSOM.
  useEffect(() => {
    const el = handle.current;
    if (!el || !edge) return;
    const place = () => {
      const table = tableElement(editor, edge.table);
      const widths = measureColumns(editor, edge.table);
      if (!table || !widths) return;
      const rect = table.getBoundingClientRect();
      const rtl = getComputedStyle(table).direction === 'rtl';
      const offset = widths.slice(0, edge.column + 1).reduce((a, b) => a + b, 0);
      const x = rtl ? rect.right - offset : rect.left + offset;
      el.style.translate = `${Math.round(x - 3)}px ${Math.round(rect.top)}px`;
      el.style.blockSize = `${Math.round(rect.height)}px`;
    };
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) el.showPopover();
    place();
    const doc = el.ownerDocument;
    doc.addEventListener('scroll', place, true);
    return () => doc.removeEventListener('scroll', place, true);
  }, [editor, edge]);

  if (!on || !edge || !options) return null;

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    const table = tableElement(editor, edge.table);
    const widths = measureColumns(editor, edge.table);
    if (!table || !widths) return;
    event.preventDefault();
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    setDragging(true);
    const rtl = getComputedStyle(table).direction === 'rtl';
    const startX = event.clientX;
    const startWidth = widths[edge.column] ?? options.minColumnWidth;
    const startTranslate = el.style.translate;
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
    let next = widths;
    const move = (e: PointerEvent) => {
      const delta = (e.clientX - startX) * (rtl ? -1 : 1);
      const width = Math.max(options.minColumnWidth, startWidth + delta);
      next = widths.map((w, i) => (i === edge.column ? width : w));
      // A preview on the columns themselves; the document changes on release.
      cols.forEach((col, i) => col.style.setProperty('width', `${next[i]}px`));
      const [x, y] = startTranslate.split(' ');
      el.style.translate = `${Number.parseFloat(x ?? '0') + (width - startWidth) * (rtl ? -1 : 1)}px ${y}`;
    };
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      setDragging(false);
      if (next !== widths) editor.commands.setColumnWidths(next, edge.table);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={handle}
      popover="manual"
      className="tei-table-resizer tei-portal"
      data-tei-ui=""
      data-tei-control="table-resizer"
      data-active={dragging ? '' : undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={editor.t('table.resizeColumn')}
      onPointerDown={start}
      onPointerLeave={(event) => {
        if (dragging) return;
        setEdge(null);
        // Off the handle and out of the table: the root saw no leave (the
        // pointer left it for the handle), so tell its listeners now.
        const root = editor.lexical.getRootElement();
        const to = event.relatedTarget;
        if (
          root &&
          !(to instanceof Node && root.contains(to)) &&
          !intoTableControl(event.nativeEvent)
        ) {
          root.dispatchEvent(new PointerEvent('pointerleave', { relatedTarget: to }));
        }
      }}
    />
  );
}

// -- All together -------------------------------------------------------------

export interface TableControlsProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The menu on the cell with the caret (and on right-click). Default true. */
  cellMenu?: boolean;
  /** The + bars after the last row and column. Default true. */
  addBars?: boolean;
  /** Drag a column's edge to resize it. Default: the Table extension's `resizable`. */
  resizer?: boolean;
}

/**
 * The table UI: a menu on the cell with the caret or under the pointer
 * (rows, columns, merging, colours, alignment, the table itself), the same
 * menu on right-click, + bars to add a row or column at the end, and
 * column resizing by dragging an edge. Renders nothing without `Table`.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function TableControls({
  editor: editorProp,
  cellMenu = true,
  addBars = true,
  resizer = true,
}: TableControlsProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <TableControls> needs an `editor` prop or a provider');
  if (!getExtensionOptions(editor, Table)) return null;
  return (
    <TeiEditorContext.Provider value={editor}>
      {cellMenu && <TableCellMenu editor={editor} />}
      {addBars && <TableAddBars editor={editor} />}
      {resizer && <TableColumnResizer editor={editor} />}
    </TeiEditorContext.Provider>
  );
}
