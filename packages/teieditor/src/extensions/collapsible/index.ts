import { configExtension } from '@lexical/extension';
import { BlockSchema, DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  type MultilineElementTransformer,
  type Transformer,
} from '@lexical/markdown';
import {
  $create,
  $createParagraphNode,
  $getDocument,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  ElementNode,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type NodeKey,
  type RangeSelection,
  type SerializedElementNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { TeiEditor } from '../../core/editor.js';
import { iconElement } from '../../core/icon-dom.js';
import { $findSlotHost, registerStepOut } from '../../core/slot-host.js';
import { chevronRight, collapsible as collapsibleIcon } from '../../icons/index.js';
import { $flattenBlocks } from '../../utils/flatten-blocks.js';
import { $blockOf, $selectedBlocks } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setCollapsible: [];
    unsetCollapsible: [key?: NodeKey];
    toggleCollapsible: [];
    toggleCollapsibleOpen: [key?: NodeKey];
    setCollapsibleOpen: [open: boolean, key?: NodeKey];
  }
  interface TeiActiveStates {
    collapsible: [];
  }
}

export interface SerializedCollapsibleNode extends SerializedElementNode {
  open: boolean;
}

/**
 * A section that opens and closes: a title, always shown, and a body of
 * any blocks under it. In the editor a chevron before the title opens and
 * closes it; saved, it is `<details>` and `<summary>`, which a browser
 * opens and closes with no script. A closed body is `hidden="until-found"`,
 * so the browser's find in page opens it on a match.
 */
export class CollapsibleNode extends ElementNode {
  __open = true;

  $config() {
    return this.config('collapsible', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__open = prev.__open;
  }

  getOpen(): boolean {
    return this.getLatest().__open;
  }

  setOpen(open: boolean): this {
    const self = this.getWritable();
    self.__open = open;
    return self;
  }

  toggleOpen(): this {
    return this.setOpen(!this.getOpen());
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedCollapsibleNode>): this {
    const self = super.updateFromJSON(json);
    const { open } = json as Partial<SerializedCollapsibleNode>;
    return typeof open === 'boolean' ? self.setOpen(open) : self;
  }

  exportJSON(): SerializedCollapsibleNode {
    return { ...super.exportJSON(), open: this.getOpen() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const box = doc.createElement('div');
    box.className = (config.theme.collapsible as string | undefined) ?? 'tei-collapsible';
    const toggle = doc.createElement('span');
    toggle.className = 'tei-collapsible-toggle';
    toggle.setAttribute('contenteditable', 'false');
    toggle.setAttribute('data-tei-collapsible-toggle', '');
    toggle.setAttribute('aria-hidden', 'true');
    const icon = TeiEditor.of($getEditor())?.icon('chevronRight');
    if (icon) toggle.append(iconElement(doc, icon));
    box.append(toggle);
    paintOpen(box, this.__open);
    return box;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__open !== this.__open) paintOpen(dom, this.__open);
    return false;
  }

  /** The title and body go after the chevron. */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(element).withAfter(element.firstElementChild);
  }

  exportDOM(): DOMExportOutput {
    const details = $getDocument().createElement('details');
    if (this.getOpen()) details.setAttribute('open', '');
    return { element: details };
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

/** Its title: one line of text, always shown. */
export class CollapsibleTitleNode extends ElementNode {
  $config() {
    return this.config('collapsible-title', { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement('div');
    dom.className =
      (config.theme.collapsibleTitle as string | undefined) ?? 'tei-collapsible-title';
    const label = TeiEditor.of($getEditor())?.t('collapsible.title') ?? 'Title';
    dom.setAttribute('data-tei-empty-label', label);
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    return { element: $getDocument().createElement('summary') };
  }

  /**
   * Enter in the title: a new first line of the body when it is open, a
   * line after the section when it is closed. Text after the caret goes
   * with it.
   */
  insertNewAfter(_selection: RangeSelection, restoreSelection = true): ElementNode {
    const section = this.getParent();
    const body = this.getNextSibling();
    if ($isCollapsibleNode(section) && section.getOpen() && $isCollapsibleContentNode(body)) {
      const first = body.getFirstChild();
      // A body that is one empty line (a section just made): that line.
      if ($isParagraphNode(first) && first.isEmpty() && !first.getNextSibling()) return first;
      const line = $createParagraphNode();
      if (first) first.insertBefore(line, restoreSelection);
      else body.append(line);
      return line;
    }
    const line = $createParagraphNode();
    (section ?? this).insertAfter(line, restoreSelection);
    return line;
  }

  canIndent(): false {
    return false;
  }
}

/** Its body: any blocks. */
export class CollapsibleContentNode extends ElementNode {
  $config() {
    return this.config('collapsible-content', { extends: ElementNode });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement('div');
    dom.className =
      (config.theme.collapsibleContent as string | undefined) ?? 'tei-collapsible-content';
    dom.setAttribute('data-tei-collapsible-content', '');
    const section = this.getParent();
    if ($isCollapsibleNode(section) && !section.__open) hideBody(dom);
    // Find in page matched closed text: open the section to show it.
    dom.addEventListener('beforematch', () => {
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(dom);
        const parent = node?.getParent();
        if ($isCollapsibleNode(parent) && !parent.getOpen()) parent.setOpen(true);
      });
    });
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const div = $getDocument().createElement('div');
    div.setAttribute('data-tei-collapsible-content', '');
    return { element: div };
  }

  isShadowRoot(): boolean {
    return true;
  }

  canIndent(): false {
    return false;
  }
}

/** Open or closed, on the section's DOM and its body's. */
function paintOpen(box: HTMLElement, open: boolean): void {
  if (open) box.setAttribute('data-open', '');
  else box.removeAttribute('data-open');
  const body = box.querySelector<HTMLElement>(':scope > [data-tei-collapsible-content]');
  if (!body) return;
  if (open) body.removeAttribute('hidden');
  else hideBody(body);
}

/** Hidden, but found by find in page where the browser can. */
function hideBody(body: HTMLElement): void {
  body.setAttribute('hidden', 'until-found');
}

export function $createCollapsibleNode(open = true): CollapsibleNode {
  return $create(CollapsibleNode).setOpen(open);
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return $create(CollapsibleTitleNode);
}

export function $createCollapsibleContentNode(): CollapsibleContentNode {
  return $create(CollapsibleContentNode);
}

export function $isCollapsibleNode(node: LexicalNode | null | undefined): node is CollapsibleNode {
  return node instanceof CollapsibleNode;
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
  return node instanceof CollapsibleTitleNode;
}

export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
  return node instanceof CollapsibleContentNode;
}

/** A section with `title` (inline nodes) over `body` (blocks; an empty line when none). */
export function $createCollapsible(
  title: readonly LexicalNode[] = [],
  body: readonly LexicalNode[] = [],
  open = true,
): CollapsibleNode {
  const content = $createCollapsibleContentNode();
  content.append(...(body.length > 0 ? body : [$createParagraphNode()]));
  return $createCollapsibleNode(open).append(
    $createCollapsibleTitleNode().append(...title),
    content,
  );
}

// -- Keeping its shape --------------------------------------------------------

/** A title then a body, whatever came in: paste, JSON, a plugin's code. */
function $normalizeSection(section: CollapsibleNode): void {
  const first = section.getFirstChild();
  let title: CollapsibleTitleNode;
  if ($isCollapsibleTitleNode(first)) title = first;
  else {
    title = $createCollapsibleTitleNode();
    section.splice(0, 0, [title]);
  }
  const next = title.getNextSibling();
  let body: CollapsibleContentNode;
  if ($isCollapsibleContentNode(next)) body = next;
  else {
    body = $createCollapsibleContentNode();
    title.insertAfter(body);
  }
  // Anything else goes into the body.
  for (let extra = body.getNextSibling(); extra; extra = body.getNextSibling()) {
    if ($isCollapsibleContentNode(extra)) {
      body.append(...extra.getChildren());
      extra.remove();
    } else body.append($asBlock(extra));
  }
  if (body.isEmpty()) body.append($createParagraphNode());
}

/** A stray title, or a line of inline nodes: a paragraph. */
function $asBlock(node: LexicalNode): LexicalNode {
  if ($isCollapsibleTitleNode(node)) {
    const line = $createParagraphNode().append(...node.getChildren());
    node.remove();
    return line;
  }
  if (!$isElementNode(node) || node.isInline()) {
    const line = $createParagraphNode();
    node.replace(line);
    return line.append(node);
  }
  return node;
}

// -- HTML ---------------------------------------------------------------------

/**
 * `<details>`: its `<summary>` the title, the rest the body (in our
 * `<div data-tei-collapsible-content>`, Lexical's, or loose).
 */
const DETAILS_RULE = defineImportRule({
  name: '@teispace/teieditor/collapsible',
  match: sel.tag('details'),
  $import: (ctx, el) => {
    const doc = el.ownerDocument;
    let title: LexicalNode[] = [];
    const rest = doc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      if (title.length === 0 && child.nodeName === 'SUMMARY') {
        title = $flattenBlocks(ctx.$importChildren(child as Element));
        continue;
      }
      // No `instanceof Element`: on the server there is no global to test against.
      const wrapper =
        child.nodeType === 1 &&
        ['data-tei-collapsible-content', 'data-lexical-collapsible-content'].some((name) =>
          (child as Element).hasAttribute(name),
        );
      if (wrapper) rest.append(...Array.from(child.childNodes).map((n) => n.cloneNode(true)));
      else rest.append(child.cloneNode(true));
    }
    const body = ctx.$importChildren(rest, { schema: BlockSchema });
    return [$createCollapsible(title, body, el.hasAttribute('open'))];
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

const escapeHTML = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHTML = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * GitHub's way: `<details>` and `<summary>` lines around the body's own
 * markdown, a blank line either side of it. Sections nest.
 */
export const COLLAPSIBLE: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [CollapsibleNode, CollapsibleTitleNode, CollapsibleContentNode],
  regExpStart: /^<details(\s+open)?>\s*$/i,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    let at = startLineIndex + 1;
    while (at < lines.length && lines[at]?.trim() === '') at++;
    const summary = /^<summary>(.*)<\/summary>\s*$/i.exec(lines[at] ?? '');
    let depth = 1;
    const body: string[] = [];
    let end = summary ? at + 1 : startLineIndex + 1;
    for (; end < lines.length; end++) {
      const line = lines[end] ?? '';
      if (/^<details(\s+open)?>\s*$/i.test(line)) depth++;
      else if (/^<\/details>\s*$/i.test(line) && --depth === 0) break;
      body.push(line);
    }
    // No end: not ours, it stays text.
    if (depth > 0) return null;
    const transformers = $transformers();
    const heading = summary?.[1] ? unescapeHTML(summary[1]) : '';
    const titleLine = $generateNodesFromMarkdownString(heading, transformers)[0];
    const title = $isElementNode(titleLine) ? titleLine.getChildren() : [];
    const blocks = $generateNodesFromMarkdownString(body.join('\n'), transformers);
    rootNode.append($createCollapsible(title, blocks, Boolean(startMatch[1])));
    return [true, end];
  },
  replace: () => false,
  export: (node) => {
    if (!$isCollapsibleNode(node)) return null;
    const title = node.getFirstChild();
    const body = title?.getNextSibling();
    const inner = $isCollapsibleContentNode(body)
      ? $convertToMarkdownString($transformers(), body)
      : '';
    return [
      node.getOpen() ? '<details open>' : '<details>',
      `<summary>${escapeHTML(title?.getTextContent() ?? '')}</summary>`,
      '',
      ...(inner ? [inner, ''] : []),
      '</details>',
    ].join('\n');
  },
};

// -- Commands -----------------------------------------------------------------

/** The section meant: the one keyed, or the one the selection is in. */
function $getSection(key?: NodeKey): CollapsibleNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isCollapsibleNode(node) ? node : null;
  }
  const at = $getSelection()?.getNodes()[0];
  return at ? $findSlotHost(at, $isCollapsibleNode) : null;
}

/** A block whose children are text: its line can be a title. */
const $isTextBlock = (node: LexicalNode | undefined): node is ElementNode =>
  $isElementNode(node) &&
  !node.isShadowRoot() &&
  node.getChildren().every((child) => !$isElementNode(child) || child.isInline());

/**
 * The selected blocks as a section: the first one's text its title (when
 * it is a line of text), the rest its body.
 */
function $wrap(): boolean {
  const blocks = $selectedBlocks();
  const first = blocks[0];
  if (!first) return false;
  const parent = first.getParent();
  const mine = blocks.filter((block) => parent?.is(block.getParent()));
  const head = $isTextBlock(first) ? first : null;
  const section = $createCollapsible(head ? head.getChildren() : [], head ? mine.slice(1) : mine);
  first.insertBefore(section);
  if (head) head.remove();
  const title = section.getFirstChild();
  // An empty title gets the caret, to type it.
  if ($isElementNode(title) && title.isEmpty()) title.select();
  return true;
}

/** Its title's text as a line, then its body's blocks, in its place. */
function $unwrap(section: CollapsibleNode): void {
  const title = section.getFirstChild();
  const body = title?.getNextSibling();
  if ($isCollapsibleTitleNode(title) && !title.isEmpty()) {
    section.insertBefore($createParagraphNode().append(...title.getChildren()));
  }
  if ($isCollapsibleContentNode(body)) {
    for (const block of body.getChildren()) section.insertBefore(block);
  }
  section.remove();
}

/** Backspace at the start of the title takes the section away, keeping its text. */
function $backspace(event: KeyboardEvent | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.offset !== 0)
    return false;
  const anchor = selection.anchor.getNode();
  const title = $isCollapsibleTitleNode(anchor) ? anchor : anchor.getParent();
  if (!$isCollapsibleTitleNode(title)) return false;
  if (anchor !== title && anchor !== title.getFirstDescendant()) return false;
  const section = title.getParent();
  if (!$isCollapsibleNode(section)) return false;
  event?.preventDefault();
  const text = title.getFirstDescendant();
  $unwrap(section);
  // The caret stays at the start of what was the title (or the first block).
  if (text?.isAttached()) text.selectStart();
  return true;
}

/**
 * Sections that open and close (Notion's toggles, `<details>` in HTML):
 * the slash menu and the block handle's turn blocks into one, ⌘⌥7 too;
 * its chevron or ⌘⌥↵ opens and closes it.
 */
export const Collapsible = defineTeiExtension({
  name: '@teispace/teieditor/collapsible',
  nodes: [CollapsibleNode, CollapsibleTitleNode, CollapsibleContentNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [DETAILS_RULE] })],
  markdown: { collapsible: COLLAPSIBLE },
  register: ({ lexical }) => {
    const toggleOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest('[data-tei-collapsible-toggle]') : null;
    const onPointerDown = (event: PointerEvent) => {
      if (toggleOf(event.target) && event.pointerType !== 'touch') event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const toggle = toggleOf(event.target);
      const box = toggle?.parentElement;
      if (!toggle || !box) return;
      event.preventDefault();
      if (!lexical.isEditable()) {
        // Read-only: a reader opens and closes it for themselves; the document stays as it is.
        paintOpen(box, !box.hasAttribute('data-open'));
        return;
      }
      lexical.update(() => {
        const node = $getNearestNodeFromDOMNode(box);
        if ($isCollapsibleNode(node)) node.toggleOpen();
      });
    };
    return mergeRegister(
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('pointerdown', onPointerDown);
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('pointerdown', onPointerDown);
        root?.addEventListener('click', onClick);
      }),
      lexical.registerNodeTransform(CollapsibleNode, $normalizeSection),
      // A title or body out of its section is a line, or its blocks.
      lexical.registerNodeTransform(CollapsibleTitleNode, (title) => {
        const section = title.getParent();
        if (!$isCollapsibleNode(section)) {
          title.replace($createParagraphNode().append(...title.getChildren()));
        } else if (title.getChildren().some((c) => $isElementNode(c) && !c.isInline())) {
          title.splice(0, title.getChildrenSize(), $flattenBlocks(title.getChildren()));
        }
      }),
      lexical.registerNodeTransform(CollapsibleContentNode, (body) => {
        if ($isCollapsibleNode(body.getParent())) return;
        for (const block of body.getChildren()) body.insertBefore(block);
        body.remove();
      }),
      // Closing it with the caret inside: the caret goes to the title.
      lexical.registerUpdateListener(({ editorState, dirtyElements }) => {
        if (dirtyElements.size === 0) return;
        const hidden = editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return null;
          const block = $blockOf(selection.anchor.getNode());
          const body = block?.getParent();
          const section = body?.getParent();
          return $isCollapsibleContentNode(body) &&
            $isCollapsibleNode(section) &&
            !section.getOpen()
            ? section.getKey()
            : null;
        });
        if (hidden === null) return;
        lexical.update(() => {
          const section = $getNodeByKey(hidden);
          if ($isCollapsibleNode(section)) section.getFirstChild<ElementNode>()?.selectEnd();
        });
      }),
      lexical.registerCommand(KEY_BACKSPACE_COMMAND, $backspace, COMMAND_PRIORITY_LOW),
      registerStepOut(lexical, $isCollapsibleContentNode, (body) => body.getParent() ?? body),
    );
  },
  commands: {
    setCollapsible: {
      run: () => {
        if ($getSection()) return false;
        if (!$wrap()) return false;
      },
      can: () => $getSection() === null && $selectedBlocks().length > 0,
    },
    toggleCollapsible: {
      run: () => {
        const section = $getSection();
        if (section) $unwrap(section);
        else if (!$wrap()) return false;
      },
      can: () => $getSection() !== null || $selectedBlocks().length > 0,
    },
    unsetCollapsible: {
      run: (_ctx, key?: NodeKey) => {
        const section = $getSection(key);
        if (!section) return false;
        $unwrap(section);
      },
      can: (_ctx, key?: NodeKey) => $getSection(key) !== null,
    },
    toggleCollapsibleOpen: {
      run: (_ctx, key?: NodeKey) => {
        const section = $getSection(key);
        if (!section) return false;
        section.toggleOpen();
      },
      can: (_ctx, key?: NodeKey) => $getSection(key) !== null,
    },
    setCollapsibleOpen: {
      run: (_ctx, open: boolean, key?: NodeKey) => {
        const section = $getSection(key);
        if (!section || typeof open !== 'boolean') return false;
        section.setOpen(open);
      },
      can: (_ctx, _open?: boolean, key?: NodeKey) => $getSection(key) !== null,
    },
  },
  active: { collapsible: () => $getSection() !== null },
  keymap: {
    collapsible: { key: 'Mod-Alt-7', command: 'toggleCollapsible', description: 'Toggle section' },
    collapsibleOpen: {
      key: 'Mod-Alt-Enter',
      command: 'toggleCollapsibleOpen',
      description: 'Open or close the section',
    },
  },
  icons: { collapsible: collapsibleIcon, chevronRight },
  messages: {
    'block.collapsible': 'Toggle',
    'block.collapsible.description': 'A section that opens and closes',
    'collapsible.title': 'Title',
  },
  items: [
    {
      id: 'collapsible',
      label: 'block.collapsible',
      description: 'block.collapsible.description',
      icon: 'collapsible',
      in: ['slash', 'blockMenu'],
      group: 'basic',
      order: 23,
      keywords: ['toggle', 'collapse', 'expand', 'details', 'summary', 'accordion', 'fold'],
      shortcut: 'collapsible',
      command: 'toggleCollapsible',
      active: 'collapsible',
    },
  ],
});
