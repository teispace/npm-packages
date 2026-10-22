import { configExtension, type Signal, signal } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import {
  $create,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  ElementNode,
  KEY_BACKSPACE_COMMAND,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { TeiEditor } from '../../core/editor.js';
import { $findSlotHost, registerStepOut } from '../../core/slot-host.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import { stickyNote as stickyIcon, trash } from '../../icons/index.js';
import { commentFence } from '../../utils/comment-fence.js';
import { $blockOf, $selectedBlocks } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    insertStickyNote: [color?: StickyColor];
    setStickyColor: [color: StickyColor, key?: NodeKey];
    removeStickyNote: [key?: NodeKey];
    openStickyMenu: [key?: NodeKey];
  }
  interface TeiActiveStates {
    stickyNote: [];
    stickyColor: [color: StickyColor];
  }
}

/** The colours, each a pair of design tokens (`--tei-sticky-yellow`) legible light and dark. */
export const STICKY_COLORS = ['yellow', 'pink', 'green', 'blue', 'purple'] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export const isStickyColor = (value: unknown): value is StickyColor =>
  (STICKY_COLORS as readonly unknown[]).includes(value);

export interface StickyNoteStorage {
  /** `openStickyMenu`'s requests to the UI. */
  readonly menu: UiRequest;
  /** The note the menu is for. */
  readonly menuFor: Signal<NodeKey | null>;
}

export interface SerializedStickyNoteNode extends SerializedElementNode {
  color: StickyColor;
}

/**
 * A coloured note beside the text: lines and lists on a yellow, pink,
 * green, blue or purple square, floated to the end of a wide page and full
 * width on a narrow one. In the editor a swatch in its corner picks the
 * colour. Saved as `<aside data-tei-sticky="yellow">`.
 */
export class StickyNoteNode extends ElementNode {
  __color: StickyColor = 'yellow';

  $config() {
    return this.config('sticky-note', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__color = prev.__color;
  }

  getColor(): StickyColor {
    return this.getLatest().__color;
  }

  /** An unknown colour is yellow. */
  setColor(color: unknown): this {
    const self = this.getWritable();
    self.__color = isStickyColor(color) ? color : 'yellow';
    return self;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedStickyNoteNode>): this {
    return super.updateFromJSON(json).setColor((json as Partial<SerializedStickyNoteNode>).color);
  }

  exportJSON(): SerializedStickyNoteNode {
    return { ...super.exportJSON(), color: this.getColor() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const editor = TeiEditor.of($getEditor());
    const note = doc.createElement('aside');
    note.className = (config.theme.stickyNote as string | undefined) ?? 'tei-sticky';
    note.setAttribute('role', 'note');
    note.setAttribute('aria-label', editor?.t('block.sticky') ?? 'Sticky note');
    const swatch = doc.createElement('span');
    swatch.className = 'tei-sticky-swatch';
    swatch.setAttribute('contenteditable', 'false');
    swatch.setAttribute('data-tei-sticky-swatch', '');
    swatch.setAttribute('role', 'button');
    swatch.setAttribute('aria-haspopup', 'menu');
    swatch.setAttribute('aria-label', editor?.t('sticky.menu') ?? 'Note colour');
    note.append(swatch);
    note.setAttribute('data-color', this.__color);
    return note;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__color !== this.__color) dom.setAttribute('data-color', this.__color);
    return false;
  }

  /** The lines go after the swatch. */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(element).withAfter(element.firstElementChild);
  }

  exportDOM(): DOMExportOutput {
    const note = $getDocument().createElement('aside');
    note.setAttribute('data-tei-sticky', this.getColor());
    note.setAttribute('role', 'note');
    return { element: note };
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

export function $createStickyNoteNode(color?: StickyColor): StickyNoteNode {
  return $create(StickyNoteNode).setColor(color);
}

export function $isStickyNoteNode(node: LexicalNode | null | undefined): node is StickyNoteNode {
  return node instanceof StickyNoteNode;
}

// -- Keeping its shape --------------------------------------------------------

/** What a note holds: lines and lists. */
const $fits = (node: LexicalNode) => $isParagraphNode(node) || node.getType() === 'list';

/** Plain text and inline elements move as they are; anything richer (code) as its text. */
const $movable = (node: LexicalNode): boolean =>
  ($isTextNode(node) && node.getType() === 'text') ||
  $isLineBreakNode(node) ||
  ($isElementNode(node) && node.isInline() && node.getChildren().every($movable));

/**
 * Lines and lists only: another text block (a heading, a quote, code)
 * becomes a line of its text, and what has no text to give (an image, a
 * table, another note) goes on after the note.
 */
function $normalizeNote(note: StickyNoteNode): void {
  let after: LexicalNode = note;
  for (const child of note.getChildren()) {
    if ($fits(child)) continue;
    if ($isElementNode(child) && child.isInline()) {
      child.replace($createParagraphNode()).append(child);
    } else if ($isElementNode(child) && !child.isShadowRoot()) {
      const line = $createParagraphNode();
      const parts = child.getChildren();
      if (parts.every($movable)) line.append(...parts);
      else {
        child
          .getTextContent()
          .split('\n')
          .forEach((text, i) => {
            if (i > 0) line.append($createLineBreakNode());
            if (text) line.append($createTextNode(text));
          });
      }
      child.replace(line);
    } else {
      after.insertAfter(child);
      after = child;
    }
  }
  if (note.isEmpty()) note.append($createParagraphNode());
}

// -- HTML and markdown --------------------------------------------------------

const STICKY_RULE = defineImportRule({
  name: '@teispace/teieditor/sticky-note',
  match: sel.tag('aside'),
  $import: (ctx, el, $next) => {
    if (!el.hasAttribute('data-tei-sticky')) return $next();
    const node = $createStickyNoteNode(
      el.getAttribute('data-tei-sticky')?.toLowerCase() as StickyColor,
    );
    const children = ctx.$importChildren(el);
    return [node.splice(0, 0, children.length > 0 ? children : [$createParagraphNode()])];
  },
});

/** `<!-- sticky pink -->` … `<!-- /sticky -->`. */
export const STICKY_NOTE = commentFence({
  name: 'sticky',
  dependencies: [StickyNoteNode],
  is: $isStickyNoteNode,
  words: (node) => [node.getColor()],
  create: (words) => $createStickyNoteNode(words.find(isStickyColor)),
});

// -- Commands -----------------------------------------------------------------

/** The note meant: the one keyed, or the one the selection is in. */
function $getNote(key?: NodeKey): StickyNoteNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isStickyNoteNode(node) ? node : null;
  }
  const at = $getSelection()?.getNodes()[0];
  return at ? $findSlotHost(at, $isStickyNoteNode) : null;
}

function $unwrap(note: StickyNoteNode): void {
  for (const child of note.getChildren()) note.insertBefore(child);
  note.remove();
}

/** The selected blocks, those beside the first, in a new note; an empty line is the note's first. */
function $wrap(color: StickyColor | undefined): boolean {
  const blocks = $selectedBlocks();
  const first = blocks[0];
  if (!first) return false;
  const parent = first.getParent();
  const note = $createStickyNoteNode(color);
  first.insertBefore(note);
  note.append(...blocks.filter((block) => parent?.is(block.getParent())));
  return true;
}

/** Backspace at the start of a note's first line takes the note away, keeping its lines. */
function $backspace(event: KeyboardEvent | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.offset !== 0)
    return false;
  const block = $blockOf(selection.anchor.getNode());
  const note = block?.getParent();
  if (!$isParagraphNode(block) || !$isStickyNoteNode(note) || block.getPreviousSibling())
    return false;
  const anchor = selection.anchor.getNode();
  if (!anchor.is(block) && !anchor.is(block.getFirstDescendant())) return false;
  event?.preventDefault();
  $unwrap(note);
  return true;
}

const known = (color: unknown) => color === undefined || isStickyColor(color);

type Ctx = { storage: StickyNoteStorage };

/**
 * Sticky notes in the document: a coloured note of lines and lists, set
 * beside the text. The slash menu and the block handle's make one; its
 * swatch (or the context menu) changes its colour.
 */
export const StickyNote = defineTeiExtension({
  name: '@teispace/teieditor/sticky-note',
  nodes: [StickyNoteNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [STICKY_RULE] })],
  storage: (): StickyNoteStorage => ({ menu: uiRequest(), menuFor: signal(null) }),
  markdown: { stickyNote: STICKY_NOTE },
  register: (ctx) => {
    const { lexical, editor } = ctx;
    const { storage } = ctx as unknown as Ctx;
    const swatchOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest('[data-tei-sticky-swatch]') : null;
    // The swatch takes no caret, and keeps focus where it is.
    const onPointerDown = (event: PointerEvent) => {
      if (swatchOf(event.target) && event.pointerType !== 'touch') event.preventDefault();
    };
    // Its menu, or with no UI for one, the next colour.
    const onClick = (event: MouseEvent) => {
      const swatch = swatchOf(event.target);
      if (!swatch || !lexical.isEditable()) return;
      event.preventDefault();
      const key = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(swatch);
        return $isStickyNoteNode(node) ? node.getKey() : null;
      });
      if (key === null) return;
      if (hasUi(storage.menu)) {
        editor.commands.openStickyMenu(key);
        return;
      }
      lexical.update(() => {
        const node = $getNodeByKey(key);
        if (!$isStickyNoteNode(node)) return;
        const at = STICKY_COLORS.indexOf(node.getColor());
        node.setColor(STICKY_COLORS[(at + 1) % STICKY_COLORS.length]);
      });
    };
    return mergeRegister(
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('pointerdown', onPointerDown);
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('pointerdown', onPointerDown);
        root?.addEventListener('click', onClick);
      }),
      lexical.registerNodeTransform(StickyNoteNode, $normalizeNote),
      lexical.registerCommand(KEY_BACKSPACE_COMMAND, $backspace, COMMAND_PRIORITY_LOW),
      registerStepOut(lexical, $isStickyNoteNode),
    );
  },
  commands: {
    insertStickyNote: {
      run: (_ctx, color?: StickyColor) => {
        if (!known(color) || $getNote() || !$wrap(color)) return false;
      },
      can: (_ctx, color?: StickyColor) =>
        known(color) && $getNote() === null && $selectedBlocks().length > 0,
    },
    setStickyColor: {
      run: (_ctx, color: StickyColor, key?: NodeKey) => {
        const node = $getNote(key);
        if (!node || !isStickyColor(color)) return false;
        node.setColor(color);
      },
      can: (_ctx, color?: StickyColor, key?: NodeKey) =>
        $getNote(key) !== null && (color === undefined || isStickyColor(color)),
    },
    removeStickyNote: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getNote(key);
        if (!node) return false;
        $unwrap(node);
      },
      can: (_ctx, key?: NodeKey) => $getNote(key) !== null,
    },
    openStickyMenu: {
      run: ({ storage }, key?: NodeKey) => {
        const node = $getNote(key);
        if (!node || !hasUi(storage.menu)) return false;
        // Its items act on the note the caret is in: put it there.
        if ($getNote()?.getKey() !== node.getKey()) node.getFirstChild()?.selectStart();
        storage.menuFor.value = node.getKey();
        return requestUi(storage.menu);
      },
      can: ({ storage }, key?: NodeKey) => hasUi(storage.menu) && $getNote(key) !== null,
    },
  },
  active: {
    stickyNote: () => $getNote() !== null,
    stickyColor: (_ctx, color: StickyColor) => $getNote()?.getColor() === color,
  },
  icons: { stickyNote: stickyIcon, trash },
  messages: {
    'block.sticky': 'Sticky note',
    'block.sticky.description': 'A coloured note beside the text',
    'sticky.menu': 'Note colour',
    'sticky.yellow': 'Yellow',
    'sticky.pink': 'Pink',
    'sticky.green': 'Green',
    'sticky.blue': 'Blue',
    'sticky.purple': 'Purple',
    'sticky.remove': 'Remove sticky note',
  },
  items: [
    {
      id: 'stickyNote',
      label: 'block.sticky',
      description: 'block.sticky.description',
      icon: 'stickyNote',
      in: ['slash', 'blockMenu'],
      group: 'basic',
      order: 25,
      keywords: ['sticky', 'note', 'post-it', 'postit', 'memo', 'aside', 'margin'],
      command: 'insertStickyNote',
      active: 'stickyNote',
    },
    ...STICKY_COLORS.map((color, i) => ({
      id: `sticky-${color}`,
      label: `sticky.${color}`,
      in: ['stickyMenu'] as const,
      group: 'sticky',
      order: i,
      command: 'setStickyColor' as const,
      args: [color],
      active: 'stickyColor' as const,
      activeArgs: [color],
    })),
    {
      id: 'removeStickyNote',
      label: 'sticky.remove',
      icon: 'trash',
      in: ['stickyMenu'],
      group: 'stickyRemove',
      command: 'removeStickyNote',
    },
  ],
});
