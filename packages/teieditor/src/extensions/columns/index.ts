import { configExtension, type Signal, signal } from '@lexical/extension';
import { BlockSchema, DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  type MultilineElementTransformer,
  type Transformer,
} from '@lexical/markdown';
import { $isAtEndOfNode, $isAtStartOfNode } from '@lexical/utils';
import {
  $create,
  $createParagraphNode,
  $getDocument,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  ElementNode,
  isModifierMatch,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import { TeiEditor } from '../../core/editor.js';
import { iconElement } from '../../core/icon-dom.js';
import { $canInsertBlock, $findSlotHost, $insertBlockAtSelection } from '../../core/slot-host.js';
import type { TeiItem } from '../../core/types.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  columns3,
  columns4,
  columns as columnsIcon,
  columnsNarrowWide,
  columnsWideMiddle,
  columnsWideNarrow,
  plus,
  rows3,
  trash,
} from '../../icons/index.js';
import { $blockOf } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    insertColumns: [layout?: ColumnsLayoutInput];
    setColumnsLayout: [layout: ColumnsLayoutInput, key?: NodeKey];
    addColumn: [key?: NodeKey];
    removeColumn: [index?: number, key?: NodeKey];
    unsetColumns: [key?: NodeKey];
    nextColumn: [];
    previousColumn: [];
    openColumnsMenu: [key?: NodeKey];
  }
  interface TeiActiveStates {
    columns: [];
    columnsLayout: [layout: ColumnsLayoutInput];
  }
}

/** The extension's name, which the items ask for its options. */
export const COLUMNS_EXTENSION = '@teispace/teieditor/columns';

/** Column widths as shares of the row, start to end: `[1, 2]` is a third and two thirds. */
export type ColumnsLayout = readonly number[];

/** A layout as an array, or as CSS writes it (`'1fr 2fr'`). */
export type ColumnsLayoutInput = ColumnsLayout | string;

export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;
/** The widest a column's share can be; the stylesheet has a rule for each. */
export const MAX_COLUMN_WIDTH = 6;

/** The layouts on offer by default, each with its label and icon. */
export const COLUMN_LAYOUTS: readonly ColumnsLayout[] = [
  [1, 1],
  [1, 2],
  [2, 1],
  [1, 1, 1],
  [1, 2, 1],
  [1, 1, 1, 1],
];

const LAYOUT_ICONS: Record<string, string> = {
  '1-1': 'columns',
  '1-2': 'columnsNarrowWide',
  '2-1': 'columnsWideNarrow',
  '1-1-1': 'columns3',
  '1-2-1': 'columnsWideMiddle',
  '1-1-1-1': 'columns4',
};

export interface ColumnsOptions {
  /** The layouts the menus offer, and a click on the control steps through. Default {@link COLUMN_LAYOUTS}. */
  layouts: readonly ColumnsLayout[];
}

export interface ColumnsStorage {
  /** `openColumnsMenu`'s requests to the UI. */
  readonly menu: UiRequest;
  /** The columns block the menu is for. */
  readonly menuFor: Signal<NodeKey | null>;
}

export interface SerializedColumnNode extends SerializedElementNode {
  width: number;
}

/** A layout's id: `'1-2'`. */
export const layoutId = (layout: ColumnsLayout): string => layout.join('-');

/** `'1fr 2fr'`, as saved HTML and markdown write it. */
const layoutTemplate = (layout: ColumnsLayout): string => layout.map((w) => `${w}fr`).join(' ');

/** A share a column can have: a whole number from 1 to {@link MAX_COLUMN_WIDTH}. */
const clampWidth = (width: number): number =>
  Number.isFinite(width) ? Math.min(MAX_COLUMN_WIDTH, Math.max(1, Math.round(width))) : 1;

/**
 * A layout from an array or a CSS track list (`'1fr 2fr'`,
 * `'repeat(3, 1fr)'`, `'1 2'`); `null` unless it has 2 to 4 columns of
 * positive shares. Shares round to whole numbers up to {@link MAX_COLUMN_WIDTH}.
 */
export function parseColumnsLayout(input: unknown): number[] | null {
  let parts: unknown[];
  if (Array.isArray(input)) parts = input;
  else if (typeof input === 'string') {
    const text = input.trim();
    const repeat = /^repeat\(\s*(\d+)\s*,\s*([\d.]+)(?:fr)?\s*\)$/i.exec(text);
    if (repeat) parts = Array(Math.min(Number(repeat[1]), MAX_COLUMNS + 1)).fill(Number(repeat[2]));
    else parts = text.split(/[\s,-]+/).map((part) => /^([\d.]+)(?:fr)?$/i.exec(part)?.[1] ?? NaN);
  } else return null;
  if (parts.length < MIN_COLUMNS || parts.length > MAX_COLUMNS) return null;
  const widths = parts.map(Number);
  return widths.every((w) => Number.isFinite(w) && w > 0) ? widths.map(clampWidth) : null;
}

/**
 * Blocks side by side: 2 to 4 {@link ColumnNode}s, each holding any
 * blocks. Saved as `<div data-tei-columns="1fr 2fr">` around a
 * `<div data-tei-column="…">` for each; the stylesheet lays them out from
 * those attributes alone (no style attribute for a strict CSP), and stacks
 * them on a narrow screen.
 */
export class ColumnsNode extends ElementNode {
  $config() {
    return this.config('columns', { extends: ElementNode });
  }

  /** Its columns' widths, start to end. */
  getLayout(): number[] {
    return this.getChildren()
      .filter($isColumnNode)
      .map((column) => column.getWidth());
  }

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const box = doc.createElement('div');
    box.className = (config.theme.columns as string | undefined) ?? 'tei-columns';
    const editor = TeiEditor.of($getEditor());
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', editor?.t('columns.menu') ?? 'Columns');
    // The control for its menu: shown on hover, and while the caret is inside.
    const control = doc.createElement('span');
    control.className = 'tei-columns-control';
    control.setAttribute('contenteditable', 'false');
    control.setAttribute('data-tei-columns-control', '');
    control.setAttribute('aria-hidden', 'true');
    const icon = editor?.icon('columns');
    if (icon) control.append(iconElement(doc, icon));
    box.append(control);
    return box;
  }

  updateDOM(): false {
    return false;
  }

  /** The columns go after the control. */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(element).withAfter(element.firstElementChild);
  }

  exportDOM(): DOMExportOutput {
    const box = $getDocument().createElement('div');
    box.setAttribute('data-tei-columns', layoutTemplate(this.getLayout()));
    return { element: box };
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  canIndent(): false {
    return false;
  }
}

/** One column: any blocks, never none. Its width is its share of the row. */
export class ColumnNode extends ElementNode {
  __width = 1;

  $config() {
    return this.config('column', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__width = prev.__width;
  }

  getWidth(): number {
    return this.getLatest().__width;
  }

  setWidth(width: number): this {
    const self = this.getWritable();
    self.__width = clampWidth(width);
    return self;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedColumnNode>): this {
    const self = super.updateFromJSON(json);
    const { width } = json as Partial<SerializedColumnNode>;
    return typeof width === 'number' ? self.setWidth(width) : self;
  }

  exportJSON(): SerializedColumnNode {
    return { ...super.exportJSON(), width: this.getWidth() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement('div');
    dom.className = (config.theme.column as string | undefined) ?? 'tei-column';
    dom.setAttribute('data-tei-column', String(this.__width));
    return dom;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__width !== this.__width) dom.setAttribute('data-tei-column', String(this.__width));
    return false;
  }

  exportDOM(): DOMExportOutput {
    const dom = $getDocument().createElement('div');
    dom.setAttribute('data-tei-column', String(this.getWidth()));
    return { element: dom };
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  canIndent(): false {
    return false;
  }
}

export function $createColumnsNode(): ColumnsNode {
  return $create(ColumnsNode);
}

export function $createColumnNode(width = 1): ColumnNode {
  return $create(ColumnNode).setWidth(width);
}

export function $isColumnsNode(node: LexicalNode | null | undefined): node is ColumnsNode {
  return node instanceof ColumnsNode;
}

export function $isColumnNode(node: LexicalNode | null | undefined): node is ColumnNode {
  return node instanceof ColumnNode;
}

/** A columns block of `layout`, each column holding its `blocks` (an empty line when none). */
export function $createColumns(
  layout: ColumnsLayout = [1, 1],
  blocks: readonly (readonly LexicalNode[])[] = [],
): ColumnsNode {
  return $createColumnsNode().append(
    ...layout.map((width, i) => {
      const inside = blocks[i] ?? [];
      return $createColumnNode(width).append(
        ...(inside.length > 0 ? inside : [$createParagraphNode()]),
      );
    }),
  );
}

// -- Keeping its shape --------------------------------------------------------

/** Its blocks in its place, in order; an empty line when it has none. */
function $unwrap(node: ColumnsNode): void {
  const blocks = node.getChildren().flatMap((c) => ($isElementNode(c) ? c.getChildren() : [c]));
  if (blocks.length === 0) blocks.push($createParagraphNode());
  for (const block of blocks) node.insertBefore(block);
  node.remove();
}

/** A column with nothing typed in it: one empty line. */
const $isBlank = (column: ColumnNode): boolean => {
  const only = column.getFirstChild();
  return column.getChildrenSize() === 1 && $isParagraphNode(only) && only.isEmpty();
};

/**
 * Columns, 2 to 4 of them, whatever came in (paste, JSON, a plugin's code):
 * anything else joins the column before it; one column left is its blocks;
 * a columns block in a column is its blocks too.
 */
function $normalizeColumns(node: ColumnsNode): void {
  if (node.isEmpty()) {
    node.remove();
    return;
  }
  if ($findSlotHost(node.getParent() ?? node, $isColumnNode)) {
    $unwrap(node);
    return;
  }
  let last: ColumnNode | null = null;
  let loose: LexicalNode[] = [];
  for (const child of node.getChildren()) {
    if ($isColumnNode(child)) {
      if (loose.length > 0) child.splice(0, 0, loose);
      loose = [];
      last = child;
    } else if (last) last.append(child);
    else loose.push(child);
  }
  if (loose.length > 0) node.append($createColumnNode().append(...loose));
  const columns = $columnsOf(node);
  while (columns.length > MAX_COLUMNS) {
    const extra = columns.pop() as ColumnNode;
    columns.at(-1)?.append(...extra.getChildren());
    extra.remove();
  }
  if (node.getChildrenSize() < MIN_COLUMNS) $unwrap(node);
}

/** Never empty, and only blocks: a run of inline nodes becomes a line. */
function $normalizeColumn(column: ColumnNode): void {
  let line: ElementNode | null = null;
  for (const child of column.getChildren()) {
    if ($isElementNode(child) && !child.isInline()) line = null;
    else if ($isDecoratorNode(child) && !child.isInline()) line = null;
    else {
      if (!line) {
        line = $createParagraphNode();
        child.insertBefore(line);
      }
      line.append(child);
    }
  }
  if ($isColumnsNode(column.getParent())) {
    if (column.isEmpty()) column.append($createParagraphNode());
    return;
  }
  // Out of a columns block: its blocks.
  for (const block of column.getChildren()) column.insertBefore(block);
  column.remove();
}

// -- HTML ---------------------------------------------------------------------

/** No `instanceof Element`: on the server there is no global to test against. */
const isElement = (node: Node): node is Element => node.nodeType === 1;

/** An element's `grid-template-columns`, through the CSSOM or, where that drops it, its style attribute. */
const tracks = (el: Element): string =>
  (el as HTMLElement).style?.getPropertyValue('grid-template-columns') ||
  (/grid-template-columns\s*:\s*([^;]+)/i.exec(el.getAttribute('style') ?? '')?.[1] ?? '');

/**
 * Our `<div data-tei-columns>` and the Lexical playground's
 * `<div data-lexical-layout-container>`: each column's width from its own
 * attribute, else the container's track list (`grid-template-columns` in
 * the playground's style), else an equal share.
 */
const COLUMNS_RULE = defineImportRule({
  name: COLUMNS_EXTENSION,
  match: sel.tag('div'),
  $import: (ctx, el, $next) => {
    const ours = el.hasAttribute('data-tei-columns');
    if (!ours && !el.hasAttribute('data-lexical-layout-container')) return $next();
    const item = ours ? 'data-tei-column' : 'data-lexical-layout-item';
    const template =
      parseColumnsLayout(ours ? el.getAttribute('data-tei-columns') : tracks(el)) ?? [];
    const node = $createColumnsNode();
    const doc = el.ownerDocument;
    let loose = doc.createDocumentFragment();
    const flush = (column: ColumnNode | null) => {
      if (!loose.hasChildNodes()) return;
      const blocks = ctx.$importChildren(loose, { schema: BlockSchema });
      loose = doc.createDocumentFragment();
      if (blocks.length === 0) return;
      // Loose blocks before the first column get one of their own; later ones join the last.
      if (column) column.append(...blocks);
      else node.append($createColumnNode().append(...blocks));
    };
    for (const child of Array.from(el.childNodes)) {
      if (isElement(child) && child.hasAttribute(item)) {
        flush(node.getLastChild<ColumnNode>());
        const index = node.getChildrenSize();
        const own = Number(child.getAttribute(item));
        const width = ours && own > 0 ? own : (template[index] ?? 1);
        const blocks = ctx.$importChildren(child, { schema: BlockSchema });
        node.append($createColumnNode(width).append(...blocks));
      } else if (!(child.nodeType === 3 && !child.textContent?.trim())) {
        loose.append(child.cloneNode(true));
      }
    }
    flush(node.getLastChild<ColumnNode>());
    return node.isEmpty() ? [] : [node];
  },
});

// -- Markdown -----------------------------------------------------------------

function $transformers(): Transformer[] {
  try {
    return TeiEditor.of($getEditor())?.markdownTransformers ?? [];
  } catch {
    return [];
  }
}

const START = /^<!--\s*columns((?:\s+[\d.]+fr)*)\s*-->\s*$/i;
const BREAK = /^<!--\s*column\s*-->\s*$/i;
const END = /^<!--\s*\/columns\s*-->\s*$/i;

/**
 * Markdown has no columns: HTML comments mark them, which any renderer
 * hides, leaving each column's blocks one after another.
 *
 * ```md
 * <!-- columns 1fr 2fr -->
 *
 * The first column's blocks
 *
 * <!-- column -->
 *
 * The second's
 *
 * <!-- /columns -->
 * ```
 */
export const COLUMNS: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [ColumnsNode, ColumnNode],
  regExpStart: START,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    const parts: string[][] = [[]];
    let depth = 1;
    let end = startLineIndex + 1;
    for (; end < lines.length; end++) {
      const line = lines[end] ?? '';
      if (START.test(line)) depth++;
      else if (END.test(line) && --depth === 0) break;
      else if (depth === 1 && BREAK.test(line)) {
        parts.push([]);
        continue;
      }
      parts.at(-1)?.push(line);
    }
    // No end: not ours, it stays text.
    if (depth > 0) return null;
    const transformers = $transformers();
    const template = parseColumnsLayout(startMatch[1] ?? '') ?? [];
    const node = $createColumnsNode().append(
      ...parts.map((part, i) =>
        $createColumnNode(template[i] ?? 1).append(
          ...$generateNodesFromMarkdownString(part.join('\n'), transformers),
        ),
      ),
    );
    rootNode.append(node);
    return [true, end];
  },
  replace: () => false,
  export: (node) => {
    if (!$isColumnsNode(node)) return null;
    const transformers = $transformers();
    const columns = node.getChildren().filter($isColumnNode);
    const out = [`<!-- columns ${layoutTemplate(node.getLayout())} -->`, ''];
    columns.forEach((column, i) => {
      if (i > 0) out.push('<!-- column -->', '');
      const inner = $convertToMarkdownString(transformers, column);
      if (inner) out.push(inner, '');
    });
    out.push('<!-- /columns -->');
    return out.join('\n');
  },
};

// -- Commands -----------------------------------------------------------------

/** The columns block meant: the one keyed, or the one the selection is in. */
function $getColumns(key?: NodeKey): ColumnsNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isColumnsNode(node) ? node : null;
  }
  const at = $getSelection()?.getNodes()[0];
  return at ? $findSlotHost(at, $isColumnsNode) : null;
}

/** The column the selection starts in. */
function $getColumn(): ColumnNode | null {
  const selection = $getSelection();
  const at = $isRangeSelection(selection) ? selection.anchor.getNode() : selection?.getNodes()[0];
  return at ? $findSlotHost(at, $isColumnNode) : null;
}

const $columnsOf = (node: ColumnsNode): ColumnNode[] => node.getChildren().filter($isColumnNode);

const sameLayout = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((w, i) => w === b[i]);

/**
 * `layout` on a columns block: widths set, columns added empty, or taken
 * away with their blocks joining the last one kept.
 */
function $setLayout(node: ColumnsNode, layout: ColumnsLayout): void {
  const columns = $columnsOf(node);
  const moved = columns.slice(layout.length).some((c) => !$isBlank(c));
  const caretGone = columns.slice(layout.length).some((c) => c.is($getColumn()));
  while (columns.length > layout.length) {
    const extra = columns.pop() as ColumnNode;
    if (!$isBlank(extra)) columns.at(-1)?.append(...extra.getChildren());
    extra.remove();
  }
  while (columns.length < layout.length) {
    const column = $createColumnNode().append($createParagraphNode());
    node.append(column);
    columns.push(column);
  }
  layout.forEach((width, i) => {
    columns[i]?.setWidth(width);
  });
  if (caretGone && !moved) columns.at(-1)?.selectEnd();
}

/**
 * The column after (or before) the caret's, its start (or end); at the
 * last (or first) the caret stays. Not in a list or code, whose Tab is
 * their own, nor in a block inside a block (a callout in a column).
 */
function $stepColumn(forward: boolean): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const block = $blockOf(selection.anchor.getNode());
  const column = block?.getParent();
  if (!block || !$isColumnNode(column) || ['list', 'code'].includes(block.getType())) return false;
  const next = forward ? column.getNextSibling() : column.getPreviousSibling();
  if ($isColumnNode(next)) {
    if (forward) next.selectStart();
    else next.selectEnd();
  }
  return true;
}

const $canStep = () => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const block = $blockOf(selection.anchor.getNode());
  return (
    block !== null &&
    $isColumnNode(block.getParent()) &&
    !['list', 'code'].includes(block.getType())
  );
};

/**
 * The caret in a column, collapsed: the column and the caret's point. With
 * `line`, only in a plain line of the column's own (not in a list, a
 * heading or a callout, whose keys at their edges are their own).
 */
function $caretInColumn(line = false) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor.getNode();
  const column = $findSlotHost(anchor, $isColumnNode);
  const node = column?.getParent();
  if (!column || !$isColumnsNode(node)) return null;
  if (line) {
    const block = $blockOf(anchor);
    if (!$isParagraphNode(block) || !column.is(block.getParent()) || block.getIndent() > 0)
      return null;
  }
  return { column, node, point: selection.anchor };
}

/** Whether a key reads forward in the caret's text: ArrowRight, or ArrowLeft right to left. */
function isForward(editor: LexicalEditor, event: KeyboardEvent, key: NodeKey): boolean {
  const dom = editor.getElementByKey(key);
  const rtl = dom?.ownerDocument.defaultView?.getComputedStyle(dom).direction === 'rtl';
  return (event.key === 'ArrowRight') !== rtl;
}

/**
 * Arrows out of a columns block, which the browser cannot always do: down
 * at a column's end, or forward at the last column's end, goes to the
 * block after it (a new line when there is none); up at a column's start,
 * or back at the first column's start, makes a line before it when
 * nothing is there.
 */
function registerArrows(editor: LexicalEditor): () => void {
  const out = (down: boolean, horizontal: boolean) => (event: KeyboardEvent | null) => {
    if (event && !isModifierMatch(event, {})) return false;
    const at = $caretInColumn();
    if (!at) return false;
    const { column, node, point } = at;
    const anchor = point.getNode();
    const forward = horizontal && event ? isForward(editor, event, anchor.getKey()) : down;
    if (forward) {
      if (!$isAtEndOfNode(point, column)) return false;
      if (horizontal && column.getNextSibling()) return false;
      const next = node.getNextSibling();
      if ($isDecoratorNode(next)) return false;
      event?.preventDefault();
      if ($isElementNode(next) && !next.isInline()) next.selectStart();
      else node.insertAfter($createParagraphNode()).selectStart();
      return true;
    }
    if (!$isAtStartOfNode(point, column)) return false;
    if (horizontal && column.getPreviousSibling()) return false;
    if (node.getPreviousSibling()) return false;
    event?.preventDefault();
    node.insertBefore($createParagraphNode()).selectStart();
    return true;
  };
  return mergeRegister(
    editor.registerCommand(KEY_ARROW_DOWN_COMMAND, out(true, false), COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_ARROW_UP_COMMAND, out(false, false), COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, out(true, true), COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_ARROW_LEFT_COMMAND, out(false, true), COMMAND_PRIORITY_LOW),
  );
}

/**
 * Backspace at a column's start and Delete at its end stay in it, rather
 * than pull a neighbour's text in: Backspace goes to the end of the column
 * before, or takes away an empty first line; in a block with nothing typed
 * anywhere, it takes the block away.
 */
function $backspace(event: KeyboardEvent | null): boolean {
  const at = $caretInColumn(true);
  if (!at || !$isAtStartOfNode(at.point, at.column)) return false;
  const { column, node } = at;
  event?.preventDefault();
  if ($columnsOf(node).every($isBlank)) {
    node.replace($createParagraphNode()).selectStart();
    return true;
  }
  const first = column.getFirstChild();
  const previous = column.getPreviousSibling();
  if ($isParagraphNode(first) && first.isEmpty() && first.getNextSibling()) {
    first.getNextSibling()?.selectStart();
    first.remove();
  } else if ($isColumnNode(previous)) previous.selectEnd();
  return true;
}

function $delete(event: KeyboardEvent | null): boolean {
  const at = $caretInColumn(true);
  if (!at || !$isAtEndOfNode(at.point, at.column)) return false;
  event?.preventDefault();
  return true;
}

/**
 * While the caret is in a columns block, `data-tei-caret` on it, so its
 * control shows where there is no hover (a phone).
 */
function registerCaretAttribute(editor: LexicalEditor): () => void {
  let shown: NodeKey | null = null;
  return editor.registerUpdateListener(({ editorState }) => {
    const key = editorState.read(() => $getColumns()?.getKey() ?? null);
    if (shown && shown !== key) editor.getElementByKey(shown)?.removeAttribute('data-tei-caret');
    // Set again each time: undo can make the block's DOM anew.
    if (key) editor.getElementByKey(key)?.setAttribute('data-tei-caret', '');
    shown = key;
  });
}

const $layoutOrNull = (layout: unknown) => parseColumnsLayout(layout);

type Ctx = { options: ColumnsOptions; storage: ColumnsStorage };

const LAYOUT_LABELS: Record<string, string> = {
  'columns.layout.1-1': '2 columns',
  'columns.layout.1-2': '2 columns: narrow, wide',
  'columns.layout.2-1': '2 columns: wide, narrow',
  'columns.layout.1-1-1': '3 columns',
  'columns.layout.1-2-1': '3 columns: wide middle',
  'columns.layout.1-1-1-1': '4 columns',
};

const offered = (editor: TeiEditor, layout: ColumnsLayout) =>
  getPeerOptions<ColumnsOptions>(editor.lexical, COLUMNS_EXTENSION)?.layouts.some((l) =>
    sameLayout(l, layout),
  ) ?? false;

/**
 * Columns: blocks side by side, 2 to 4 columns in any of the layouts on
 * offer. The slash menu puts them in; the control at the block's corner
 * (or the context menu) changes the layout, adds and deletes columns.
 * Tab and Shift-Tab step between columns; the arrows step out at the ends.
 * Saved HTML lays out the same with the stylesheet and no script; markdown
 * keeps them in HTML comments.
 */
export const Columns = defineTeiExtension({
  name: COLUMNS_EXTENSION,
  config: { layouts: COLUMN_LAYOUTS } as ColumnsOptions,
  nodes: [ColumnsNode, ColumnNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [COLUMNS_RULE] })],
  storage: (): ColumnsStorage => ({ menu: uiRequest(), menuFor: signal(null) }),
  markdown: { columns: COLUMNS },
  register: (ctx) => {
    const { lexical, editor } = ctx;
    const { storage, options } = ctx as unknown as Ctx;
    const controlOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest('[data-tei-columns-control]') : null;
    // The control takes no caret, and keeps focus where it is.
    const onPointerDown = (event: PointerEvent) => {
      if (controlOf(event.target) && event.pointerType !== 'touch') event.preventDefault();
    };
    // Its menu, or with no UI for one, the next layout with as many columns.
    const onClick = (event: MouseEvent) => {
      const control = controlOf(event.target);
      if (!control || !lexical.isEditable()) return;
      event.preventDefault();
      const key = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(control);
        return $isColumnsNode(node) ? node.getKey() : null;
      });
      if (key === null) return;
      if (hasUi(storage.menu)) {
        editor.commands.openColumnsMenu(key);
        return;
      }
      lexical.update(() => {
        const node = $getNodeByKey(key);
        if (!$isColumnsNode(node)) return;
        const current = node.getLayout();
        const same = options.layouts.filter((l) => l.length === current.length);
        const at = same.findIndex((l) => sameLayout(l, current));
        const next = same[(at + 1) % same.length];
        if (next) $setLayout(node, next);
      });
    };
    return mergeRegister(
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('pointerdown', onPointerDown);
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('pointerdown', onPointerDown);
        root?.addEventListener('click', onClick);
      }),
      lexical.registerNodeTransform(ColumnsNode, $normalizeColumns),
      lexical.registerNodeTransform(ColumnNode, $normalizeColumn),
      lexical.registerCommand(KEY_BACKSPACE_COMMAND, $backspace, COMMAND_PRIORITY_LOW),
      lexical.registerCommand(KEY_DELETE_COMMAND, $delete, COMMAND_PRIORITY_LOW),
      registerArrows(lexical),
      registerCaretAttribute(lexical),
    );
  },
  commands: {
    insertColumns: {
      run: (_ctx, layout?: ColumnsLayoutInput) => {
        const widths = layout === undefined ? [1, 1] : $layoutOrNull(layout);
        if (!widths || !$canInsertBlock() || $getColumn()) return false;
        const node = $insertBlockAtSelection($createColumns(widths));
        const first = node.getFirstChild<ColumnNode>()?.getFirstChild();
        if ($isElementNode(first)) first.selectStart();
      },
      can: (_ctx, layout?: ColumnsLayoutInput) =>
        (layout === undefined || $layoutOrNull(layout) !== null) &&
        $canInsertBlock() &&
        $getColumn() === null,
    },
    setColumnsLayout: {
      run: (_ctx, layout: ColumnsLayoutInput, key?: NodeKey) => {
        const node = $getColumns(key);
        const widths = $layoutOrNull(layout);
        if (!node || !widths) return false;
        $setLayout(node, widths);
      },
      can: (_ctx, layout?: ColumnsLayoutInput, key?: NodeKey) =>
        $getColumns(key) !== null && (layout === undefined || $layoutOrNull(layout) !== null),
    },
    addColumn: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getColumns(key);
        if (!node || node.getChildrenSize() >= MAX_COLUMNS) return false;
        const here = $getColumn();
        const after = here && node.is(here.getParent()) ? here : node.getLastChild();
        const line = $createParagraphNode();
        after?.insertAfter($createColumnNode().append(line));
        line.select();
      },
      can: (_ctx, key?: NodeKey) => {
        const node = $getColumns(key);
        return node !== null && node.getChildrenSize() < MAX_COLUMNS;
      },
    },
    removeColumn: {
      run: (_ctx, index?: number, key?: NodeKey) => {
        const node = $getColumns(key);
        if (!node) return false;
        const columns = $columnsOf(node);
        const here = $getColumn();
        const at = index ?? columns.findIndex((c) => c.is(here));
        const column = columns[at];
        if (!column) return false;
        const neighbour = columns[at + 1] ?? columns[at - 1];
        column.remove();
        if (columns.length - 1 < MIN_COLUMNS) {
          const first = neighbour?.getFirstChild();
          $unwrap(node);
          if ($isElementNode(first)) first.selectStart();
        } else neighbour?.selectStart();
      },
      can: (_ctx, index?: number, key?: NodeKey) => {
        const node = $getColumns(key);
        if (!node) return false;
        const columns = $columnsOf(node);
        const here = $getColumn();
        return columns[index ?? columns.findIndex((c) => c.is(here))] !== undefined;
      },
    },
    unsetColumns: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getColumns(key);
        if (!node) return false;
        $unwrap(node);
      },
      can: (_ctx, key?: NodeKey) => $getColumns(key) !== null,
    },
    nextColumn: { run: () => $stepColumn(true), can: $canStep },
    previousColumn: { run: () => $stepColumn(false), can: $canStep },
    openColumnsMenu: {
      run: ({ storage }, key?: NodeKey) => {
        const node = $getColumns(key);
        if (!node || !hasUi(storage.menu)) return false;
        // Its items act on the block the caret is in: put it there.
        if (!node.is($getColumns())) {
          const first = node.getFirstChild<ColumnNode>()?.getFirstChild();
          if ($isElementNode(first)) first.selectStart();
        }
        storage.menuFor.value = node.getKey();
        return requestUi(storage.menu);
      },
      can: ({ storage }, key?: NodeKey) => hasUi(storage.menu) && $getColumns(key) !== null,
    },
  },
  active: {
    columns: () => $getColumns() !== null,
    columnsLayout: (_ctx, layout: ColumnsLayoutInput) => {
      const node = $getColumns();
      const widths = $layoutOrNull(layout);
      return node !== null && widths !== null && sameLayout(node.getLayout(), widths);
    },
  },
  keymap: {
    // Lists and code take Tab first; elsewhere in a column it steps to the next.
    nextColumn: { key: 'Tab', command: 'nextColumn', description: 'Next column' },
    previousColumn: { key: 'Shift-Tab', command: 'previousColumn', description: 'Previous column' },
  },
  icons: {
    columns: columnsIcon,
    columns3,
    columns4,
    columnsNarrowWide,
    columnsWideNarrow,
    columnsWideMiddle,
    rows3,
    plus,
    trash,
  },
  messages: {
    'block.columns.description': 'Blocks side by side',
    'columns.menu': 'Columns',
    'columns.add': 'Add column',
    'columns.remove': 'Delete column',
    'columns.unset': 'Turn into blocks',
    ...LAYOUT_LABELS,
  },
  items: [
    ...COLUMN_LAYOUTS.flatMap((layout, i): TeiItem[] => {
      const id = layoutId(layout);
      const shared = {
        label: `columns.layout.${id}`,
        icon: LAYOUT_ICONS[id],
        args: [layout],
        visible: (editor: TeiEditor) => offered(editor, layout),
      };
      return [
        {
          ...shared,
          id: id === '1-1' ? 'columns' : `columns-${id}`,
          description: 'block.columns.description',
          in: ['slash', 'insert'],
          group: 'basic',
          order: 50 + i,
          keywords: ['columns', 'layout', 'side by side', 'split', 'grid', `${layout.length}`],
          command: 'insertColumns',
        },
        {
          ...shared,
          id: `columnsLayout-${id}`,
          in: ['columnsMenu'],
          group: 'columns',
          order: i,
          command: 'setColumnsLayout',
          active: 'columnsLayout',
          activeArgs: [layout],
        },
      ];
    }),
    {
      id: 'addColumn',
      label: 'columns.add',
      icon: 'plus',
      in: ['columnsMenu'],
      group: 'columnsEdit',
      command: 'addColumn',
    },
    {
      id: 'unsetColumns',
      label: 'columns.unset',
      icon: 'rows3',
      in: ['columnsMenu'],
      group: 'columnsEdit',
      order: 1,
      command: 'unsetColumns',
    },
    {
      id: 'removeColumn',
      label: 'columns.remove',
      icon: 'trash',
      in: ['columnsMenu'],
      group: 'columnsRemove',
      variant: 'danger',
      command: 'removeColumn',
    },
  ],
});
