import { $insertNodeToNearestRoot, $isAtEndOfNode, $isAtStartOfNode } from '@lexical/utils';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createRangeSelectionFromDom,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $getSlotHost,
  $getSlotNameWithinHost,
  $isElementNode,
  $isLineBreakNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  $setSelection,
  $splitNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  type ElementNode,
  getActiveElement,
  getDOMSelection,
  isModifierMatch,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  type TextNode,
} from 'lexical';

/**
 * Helpers for nodes that host editable slots (an image's caption, a card's
 * title): a click on the node's own chrome selects it whole, the caret steps
 * in and out of its slots with the keyboard, and CSS sees which ones are
 * selected. Shared by every such node, built-in or not.
 */

export type HostTest<T extends LexicalNode> = (node: LexicalNode | null | undefined) => node is T;

/** The host a node sits in, through slots and children, if any. */
export function $findSlotHost<T extends LexicalNode>(
  start: LexicalNode,
  $isHost: HostTest<T>,
): T | null {
  let node: LexicalNode | null = start;
  while (node) {
    if ($isHost(node)) return node;
    node = node.getParent() ?? $getSlotHost(node);
  }
  return null;
}

/** Select a node whole, as a click on it does. */
export function $selectNode(node: LexicalNode): void {
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
}

/**
 * A click on a host's chrome (its own DOM, outside its slots) selects the
 * host whole, without the caret the browser would drop there first. A click
 * in a slot puts the caret in it as usual.
 */
export function registerHostSelection<T extends LexicalNode>(
  editor: LexicalEditor,
  $isHost: HostTest<T>,
): () => void {
  let pressed: NodeKey | null = null;
  const $chrome = (target: EventTarget | null): T | null => {
    if (!(target instanceof Element)) return null;
    const node = $getNearestNodeFromDOMNode(target);
    if (!$isHost(node)) return null;
    const dom = editor.getElementByKey(node.getKey());
    if (!dom?.contains(target)) return null;
    const slot = target.closest('[data-lexical-slot]');
    return slot && dom.contains(slot) ? null : node;
  };
  const onPointerDown = (event: PointerEvent) => {
    pressed = null;
    if (!editor.isEditable() || event.button !== 0) return;
    const host = editor.read(() => $chrome(event.target));
    if (!host) return;
    pressed = host.getKey();
    // A touch keeps its default: WebKit drops a tap's click when its
    // pointerdown is cancelled. A tap places no caret in the chrome anyway.
    if (event.pointerType === 'touch') return;
    // No native caret in the chrome, and focus stays in the document.
    event.preventDefault();
    const root = editor.getRootElement();
    if (root && getActiveElement(root) !== root) {
      root.focus({ preventScroll: true });
      getDOMSelection(root.ownerDocument.defaultView)?.removeAllRanges();
    }
  };
  // A click into a slot while the host is selected: Lexical turns the node
  // selection into a caret on the selectionchange that follows, which can
  // come after the first keys typed. They take the DOM's caret at once.
  const onInput = (event: Event) => {
    const root = editor.getRootElement();
    const dom = getDOMSelection(root?.ownerDocument.defaultView ?? null);
    const anchor = dom?.anchorNode;
    const slot =
      anchor &&
      (anchor instanceof Element ? anchor : anchor.parentElement)?.closest('[data-lexical-slot]');
    if (root && dom && slot && root.contains(slot)) {
      if (!editor.read(() => $isNodeSelection($getSelection()))) return;
      editor.update(() => $setSelection($createRangeSelectionFromDom(dom, editor)), {
        discrete: true,
      });
      return;
    }
    // Typing with the host itself selected goes on after it. The browser's
    // caret is elsewhere (at the line's start, or nowhere), and it inserts
    // where its caret was when the event began, so the text goes in here.
    // Firefox and Safari have no caret at all then, so no input event:
    // a key that types a character is taken at keydown.
    const key = event as KeyboardEvent;
    const text =
      event.type === 'keydown'
        ? key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey && !key.isComposing
          ? key.key
          : null
        : (event as InputEvent).inputType === 'insertText'
          ? (event as InputEvent).data
          : null;
    if (!text) return;
    const $selected = () => {
      const selection = $getSelection();
      const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
      return nodes.length === 1 && $isHost(nodes[0]) ? nodes[0] : null;
    };
    if (!editor.read($selected)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    editor.update(() => {
      const host = $selected();
      if (host?.isInline()) host.selectNext(0, 0);
      else if (host) $caretAfter(host, true);
      $getSelection()?.insertText(text);
    });
  };
  return mergeRegister(
    registerSlotFocus(editor),
    editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const key = pressed;
        pressed = null;
        if (!editor.isEditable()) return false;
        const host = $chrome(event.target);
        if (!host || host.getKey() !== key) return false;
        event.preventDefault();
        $selectNode(host);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    ),
    editor.registerRootListener((root, previous) => {
      pressed = null;
      previous?.removeEventListener('pointerdown', onPointerDown);
      previous?.removeEventListener('keydown', onInput, true);
      previous?.removeEventListener('beforeinput', onInput, true);
      root?.addEventListener('pointerdown', onPointerDown);
      // Capturing, so before Lexical's own handlers on the root.
      root?.addEventListener('keydown', onInput, true);
      root?.addEventListener('beforeinput', onInput, true);
    }),
  );
}

/**
 * A slot inside a host that is not editable (a decorator) is an editing
 * host of its own, and the browser types into the focused one: when the
 * caret moves into a slot or out of one by code (a command, a key), focus
 * follows it, the caret staying where it is.
 */
function registerSlotFocus(editor: LexicalEditor): () => void {
  return editor.registerUpdateListener(({ editorState }) => {
    const root = editor.getRootElement();
    const doc = root?.ownerDocument;
    const active = doc?.activeElement;
    if (!root || !doc || !(active instanceof HTMLElement) || !root.contains(active)) return;
    // A caret's key; `root` for a node selection, which the document holds.
    const key = editorState.read(() => {
      const selection = $getSelection();
      if ($isNodeSelection(selection)) return 'root';
      return $isRangeSelection(selection) ? selection.anchor.key : null;
    });
    const dom = key === 'root' ? root : key ? editor.getElementByKey(key) : null;
    if (!dom) return;
    const slot = dom.closest('[data-lexical-slot]');
    const host =
      slot instanceof HTMLElement && root.contains(slot) && slot.contentEditable === 'true'
        ? slot
        : root;
    if (host === active) return;
    host.focus({ preventScroll: true });
    // Focus moves the browser's caret; put Lexical's back.
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $setSelection(selection.clone());
      },
      { discrete: true },
    );
  });
}

/**
 * The caret at the start of the block after a host, made if there is none;
 * with `newLine`, always a new empty line there (Enter's way).
 */
export function $caretAfter(host: LexicalNode, newLine = false): void {
  const next = host.getNextSibling();
  if (!newLine && $isElementNode(next) && !next.isInline()) {
    next.selectStart();
    return;
  }
  const paragraph = $createParagraphNode();
  host.insertAfter(paragraph);
  paragraph.select();
}

/**
 * Keys in a host's single-line slots (a caption): Enter starts a new line
 * after the host, ArrowDown at its end goes on to the block after it, ArrowUp at its start and Backspace
 * in it empty select the host. Elsewhere the keys are Lexical's.
 */
export function registerSlotKeys<T extends LexicalNode>(
  editor: LexicalEditor,
  $isHost: HostTest<T>,
): () => void {
  /** The caret's single-line slot value and its host, when the caret is in one. */
  const $slot = () => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
    let node: LexicalNode | null = selection.anchor.getNode();
    while (node?.getParent()) node = node.getParent();
    if (!node || !$isParagraphNode(node) || $getSlotNameWithinHost(node) === null) return null;
    const host = $getSlotHost(node);
    return $isHost(host) ? { host, value: node, anchor: selection.anchor } : null;
  };
  const plain = (event: KeyboardEvent | null) => event === null || isModifierMatch(event, {});
  return mergeRegister(
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const at = $slot();
        if (!at || event?.shiftKey) return false;
        event?.preventDefault();
        $caretAfter(at.host, true);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    ),
    editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        const at = $slot();
        if (!at || !plain(event) || !$isAtEndOfNode(at.anchor, at.value)) return false;
        event?.preventDefault();
        $caretAfter(at.host);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        const at = $slot();
        if (!at || !plain(event) || !$isAtStartOfNode(at.anchor, at.value)) return false;
        event?.preventDefault();
        $selectNode(at.host);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const at = $slot();
        if (!at || at.value.getTextContentSize() > 0) return false;
        event?.preventDefault();
        $selectNode(at.host);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    ),
  );
}

/**
 * `data-tei-selected` on the DOM of each node `$isHost` matches while it is
 * in a node selection, for CSS. Its own listener per call, so several node
 * types can use it side by side.
 */
export function registerSelectedAttribute<T extends LexicalNode>(
  editor: LexicalEditor,
  $isHost: HostTest<T>,
): () => void {
  let shown = new Set<NodeKey>();
  return editor.registerUpdateListener(({ editorState }) => {
    const selected = editorState.read(() => {
      const selection = $getSelection();
      return new Set(
        $isNodeSelection(selection)
          ? selection
              .getNodes()
              .filter($isHost)
              .map((node) => node.getKey())
          : [],
      );
    });
    for (const key of shown) {
      if (!selected.has(key)) editor.getElementByKey(key)?.removeAttribute('data-tei-selected');
    }
    for (const key of selected) editor.getElementByKey(key)?.setAttribute('data-tei-selected', '');
    shown = selected;
  });
}

/**
 * Keep a block node at the top of its root (the document, a table cell, a
 * caption): one that lands inside a paragraph, from pasted HTML or another
 * node's code, splits it and every block around it, so it sits between
 * their halves. The halves left empty go, as do line breaks beside it
 * (list items import a block in them between two).
 */
export function $liftBlock(node: LexicalNode): void {
  const parent = node.getParent();
  if (!parent || $isRootOrShadowRoot(parent)) return;
  // The line break or space that kept it from the text either side.
  const previous = node.getPreviousSibling();
  const next = node.getNextSibling();
  if ($isLineBreakNode(previous)) previous.remove();
  else if ($isTextNode(previous)) $trimText(previous, previous.getTextContent().trimEnd());
  if ($isLineBreakNode(next)) next.remove();
  else if ($isTextNode(next)) $trimText(next, next.getTextContent().trimStart());
  // Splits up to the root, the node's ancestors copied to the right.
  const [left, right] = $splitNode(parent, node.getIndexWithinParent());
  right.insertBefore(node);
  $pruneEdge(left, 'getLastChild');
  $pruneEdge(right, 'getFirstChild');
}

function $trimText(node: TextNode, text: string): void {
  if (text === '') node.remove();
  else if (text !== node.getTextContent()) node.setTextContent(text);
}

/** The empty elements a split leaves along one edge of a tree: a list item with nothing in it. */
function $pruneEdge(tree: LexicalNode | null, edge: 'getFirstChild' | 'getLastChild'): void {
  const chain: ElementNode[] = [];
  for (let at = tree; $isElementNode(at); at = at[edge]()) chain.push(at);
  for (const element of chain.reverse()) {
    if (!element.isEmpty()) return;
    element.remove();
  }
}

/**
 * Insert a block node where the caret is, as `$insertNodeToNearestRoot`
 * does, without the empty line that leaves above it when the caret was on
 * one (the slash menu's case).
 */
export function $insertBlock<T extends LexicalNode>(node: T): T {
  $insertNodeToNearestRoot(node);
  const before = node.getPreviousSibling();
  if ($isParagraphNode(before) && before.getChildrenSize() === 0) before.remove();
  return node.getLatest();
}

/**
 * Takes a block host out, the caret going to the block after it (or
 * before); the last block becomes an empty line, so the caret has a home.
 */
export function $removeBlockHost(host: LexicalNode): void {
  const next = host.getNextSibling();
  const previous = host.getPreviousSibling();
  if (next) next.selectStart();
  else if (previous) previous.selectEnd();
  else {
    host.replace($createParagraphNode()).selectStart();
    return;
  }
  host.remove();
}
