import { configExtension, type Signal, signal } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, defineOverlayRules, sel } from '@lexical/html';
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
  KEY_ENTER_COMMAND,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import { TeiEditor } from '../../core/editor.js';
import { iconElement } from '../../core/icon-dom.js';
import { $findSlotHost } from '../../core/slot-host.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  callout as calloutIcon,
  lightbulb,
  messageWarning,
  octagonAlert,
  trash,
  triangleAlert,
} from '../../icons/index.js';
import { $blockOf, $selectedBlocks } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setCallout: [variant?: string];
    toggleCallout: [variant?: string];
    setCalloutVariant: [variant: string, key?: NodeKey];
    unsetCallout: [key?: NodeKey];
    openCalloutMenu: [key?: NodeKey];
  }
  interface TeiActiveStates {
    callout: [];
    calloutVariant: [variant: string];
  }
}

/** The extension's name, which the node asks for its variants. */
export const CALLOUT_EXTENSION = '@teispace/teieditor/callout';

/** A kind of callout: its name (saved, and `data-variant` for CSS), label and icon. */
export interface CalloutVariant {
  name: string;
  /** A message id or the text itself. */
  label: string;
  /** An icon's name. */
  icon: string;
}

/** GitHub's alerts, which markdown writes `> [!NOTE]`. */
export const CALLOUT_VARIANTS: readonly CalloutVariant[] = [
  { name: 'note', label: 'callout.note', icon: 'callout' },
  { name: 'tip', label: 'callout.tip', icon: 'lightbulb' },
  { name: 'important', label: 'callout.important', icon: 'messageWarning' },
  { name: 'warning', label: 'callout.warning', icon: 'triangleAlert' },
  { name: 'caution', label: 'callout.caution', icon: 'octagonAlert' },
];

export interface CalloutOptions {
  /** The kinds on offer; the first is a new callout's. Default {@link CALLOUT_VARIANTS}. */
  variants: readonly CalloutVariant[];
}

export interface CalloutStorage {
  /** `openCalloutMenu`'s requests to the UI. */
  readonly menu: UiRequest;
  /** The callout the menu is for. */
  readonly menuFor: Signal<NodeKey | null>;
}

export interface SerializedCalloutNode extends SerializedElementNode {
  variant: string;
}

/** The variants installed, or the built-in ones where no editor has the extension. */
export function $calloutVariants(): readonly CalloutVariant[] {
  try {
    return (
      getPeerOptions<CalloutOptions>($getEditor(), CALLOUT_EXTENSION)?.variants ?? CALLOUT_VARIANTS
    );
  } catch {
    return CALLOUT_VARIANTS;
  }
}

const $variant = (name: string): CalloutVariant | undefined =>
  $calloutVariants().find((v) => v.name === name);

/**
 * A box that sets blocks apart, with an icon for its kind: a note, a tip, a
 * warning. It holds any blocks (paragraphs, lists, code, images), and draws
 * its own DOM, so it renders the same on a server. Saved as
 * `<div data-tei-callout="note">`, and in markdown as a GitHub alert.
 */
export class CalloutNode extends ElementNode {
  __variant = 'note';

  $config() {
    return this.config('callout', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__variant = prev.__variant;
  }

  getVariant(): string {
    return this.getLatest().__variant;
  }

  setVariant(variant: string): this {
    const self = this.getWritable();
    self.__variant = variant;
    return self;
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedCalloutNode>): this {
    const self = super.updateFromJSON(json);
    const { variant } = json as Partial<SerializedCalloutNode>;
    return typeof variant === 'string' && variant ? self.setVariant(variant) : self;
  }

  exportJSON(): SerializedCalloutNode {
    return { ...super.exportJSON(), variant: this.getVariant() };
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const box = doc.createElement('div');
    box.className = (config.theme.callout as string | undefined) ?? 'tei-callout';
    box.setAttribute('role', 'note');
    const marker = doc.createElement('span');
    marker.className = 'tei-callout-icon';
    marker.setAttribute('contenteditable', 'false');
    marker.setAttribute('data-tei-callout-icon', '');
    box.append(marker);
    this.#paint(box);
    return box;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__variant !== this.__variant) this.#paint(dom);
    return false;
  }

  /** The children go after the icon. */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(element).withAfter(element.firstElementChild);
  }

  #paint(box: HTMLElement): void {
    const variant = $variant(this.__variant) ?? $calloutVariants()[0] ?? CALLOUT_VARIANTS[0];
    const editor = TeiEditor.of($getEditor());
    box.setAttribute('data-variant', this.__variant);
    box.setAttribute('aria-label', editor?.t(variant.label) ?? variant.name);
    const marker = box.firstElementChild;
    const icon = editor?.icon(variant.icon);
    if (marker) marker.replaceChildren(...(icon ? [iconElement($getDocument(), icon)] : []));
  }

  exportDOM(): DOMExportOutput {
    const doc = $getDocument();
    const box = doc.createElement('div');
    box.setAttribute('data-tei-callout', this.getVariant());
    box.setAttribute('role', 'note');
    const variant = $variant(this.getVariant());
    const icon = variant && TeiEditor.of($getEditor())?.icon(variant.icon);
    if (icon) {
      const marker = doc.createElement('span');
      marker.setAttribute('data-tei-callout-icon', '');
      marker.append(iconElement(doc, icon));
      box.append(marker);
    }
    return { element: box };
  }

  // -- Behaviour -------------------------------------------------------------

  /** It holds blocks, as the document does. */
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

export function $createCalloutNode(variant?: string): CalloutNode {
  const node = $create(CalloutNode);
  return node.setVariant(variant ?? $calloutVariants()[0]?.name ?? 'note');
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode;
}

// -- HTML ---------------------------------------------------------------------

/** The variant a GitHub alert's classes name: `markdown-alert markdown-alert-tip`. */
const githubVariant = (el: Element): string | null => {
  if (!el.classList.contains('markdown-alert')) return null;
  for (const name of el.classList) {
    const match = /^markdown-alert-(\w+)$/.exec(name);
    if (match?.[1] && match[1] !== 'title') return match[1];
  }
  return null;
};

/** What a callout's HTML has besides its blocks: the icon, GitHub's title line. */
const CHROME = defineOverlayRules([
  defineImportRule({
    name: '@teispace/teieditor/callout/chrome',
    match: sel.tag('span', 'p'),
    $import: (_ctx, el, $next) =>
      el.hasAttribute('data-tei-callout-icon') || el.classList.contains('markdown-alert-title')
        ? []
        : $next(),
  }),
]);

/** `<div data-tei-callout>`, and GitHub's rendered alerts. */
const CALLOUT_RULE = defineImportRule({
  name: CALLOUT_EXTENSION,
  match: sel.tag('div'),
  $import: (ctx, el, $next) => {
    const variant = el.getAttribute('data-tei-callout') || githubVariant(el);
    if (!variant) return $next();
    const node = $createCalloutNode(variant.toLowerCase());
    const children = ctx.$importChildren(el, { rules: CHROME });
    return [node.splice(0, 0, children.length > 0 ? children : [$createParagraphNode()])];
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

/**
 * GitHub's alerts: `> [!NOTE]`, then the callout's own markdown, each line
 * quoted. A kind not installed stays a quote.
 */
export const CALLOUT: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [CalloutNode],
  regExpStart: /^>\s?\[!(\w+)\]\s*$/,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    const variant = startMatch[1]?.toLowerCase() ?? '';
    if (!$variant(variant)) return null;
    let end = startLineIndex;
    const body: string[] = [];
    while (end + 1 < lines.length && /^>/.test(lines[end + 1] ?? '')) {
      end++;
      body.push((lines[end] ?? '').replace(/^>\s?/, ''));
    }
    const callout = $createCalloutNode(variant);
    callout.append(...$generateNodesFromMarkdownString(body.join('\n'), $transformers()));
    if (callout.isEmpty()) callout.append($createParagraphNode());
    rootNode.append(callout);
    return [true, end];
  },
  // Only read whole; typing `> [!NOTE]` makes a quote, as anywhere.
  replace: () => false,
  export: (node) => {
    if (!$isCalloutNode(node)) return null;
    const body = $convertToMarkdownString($transformers(), node);
    const lines = body === '' ? [] : body.split('\n');
    return [
      `> [!${node.getVariant().toUpperCase()}]`,
      ...lines.map((line) => (line ? `> ${line}` : '>')),
    ].join('\n');
  },
};

// -- Commands -----------------------------------------------------------------

/** The callout meant: the one keyed, or the one the selection is in. */
function $getCallout(key?: NodeKey): CalloutNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isCalloutNode(node) ? node : null;
  }
  const selection = $getSelection();
  const at = selection?.getNodes()[0];
  return at ? $findSlotHost(at, $isCalloutNode) : null;
}

/** Its blocks in its place. */
function $unwrap(callout: CalloutNode): void {
  for (const child of callout.getChildren()) callout.insertBefore(child);
  callout.remove();
}

/** The selected blocks, those beside the first, in a new callout. */
function $wrap(variant: string | undefined): boolean {
  const blocks = $selectedBlocks();
  const first = blocks[0];
  if (!first) return false;
  const parent = first.getParent();
  const callout = $createCalloutNode(variant);
  first.insertBefore(callout);
  callout.append(...blocks.filter((block) => parent?.is(block.getParent())));
  return true;
}

const $knows = (variant: unknown) =>
  variant === undefined || $variant(String(variant)) !== undefined;

/** Backspace at the start of a callout's first line takes the callout away, keeping its text. */
function $backspace(event: KeyboardEvent | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.offset !== 0)
    return false;
  const block = $blockOf(selection.anchor.getNode());
  const callout = block?.getParent();
  if (!$isParagraphNode(block) || !$isCalloutNode(callout) || block.getPreviousSibling())
    return false;
  const anchor = selection.anchor.getNode();
  if (anchor !== block && anchor !== block.getFirstDescendant()) return false;
  event?.preventDefault();
  $unwrap(callout);
  return true;
}

/** Enter on an empty last line steps out of the callout, as in a list. */
function $enter(event: KeyboardEvent | null): boolean {
  if (event?.shiftKey) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const block = $blockOf(selection.anchor.getNode());
  const callout = block?.getParent();
  if (
    !$isParagraphNode(block) ||
    !block.isEmpty() ||
    !$isCalloutNode(callout) ||
    block.getNextSibling() ||
    !block.getPreviousSibling()
  )
    return false;
  event?.preventDefault();
  callout.insertAfter(block);
  block.select();
  return true;
}

type Ctx = { options: CalloutOptions; storage: CalloutStorage };

/**
 * Callouts: a note, tip, warning and the rest, each with its icon. The slash
 * menu and the block handle's turn blocks into one; its icon (or the
 * context menu) changes the kind. Markdown reads and writes GitHub's
 * `> [!NOTE]` alerts.
 */
export const Callout = defineTeiExtension({
  name: CALLOUT_EXTENSION,
  config: { variants: CALLOUT_VARIANTS } as CalloutOptions,
  nodes: [CalloutNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [CALLOUT_RULE] })],
  storage: (): CalloutStorage => ({ menu: uiRequest(), menuFor: signal(null) }),
  markdown: { callout: CALLOUT },
  register: (ctx) => {
    const { lexical, editor } = ctx;
    const { storage, options } = ctx as unknown as Ctx;
    const iconOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest('[data-tei-callout-icon]') : null;
    // The icon takes no caret, and keeps focus where it is.
    const onPointerDown = (event: PointerEvent) => {
      if (iconOf(event.target) && event.pointerType !== 'touch') event.preventDefault();
    };
    // Its menu, or with no UI for one, the next kind.
    const onClick = (event: MouseEvent) => {
      const icon = iconOf(event.target);
      if (!icon || !lexical.isEditable()) return;
      event.preventDefault();
      const key = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(icon);
        return $isCalloutNode(node) ? node.getKey() : null;
      });
      if (key === null) return;
      if (hasUi(storage.menu)) {
        editor.commands.openCalloutMenu(key);
        return;
      }
      const names = options.variants.map((v) => v.name);
      lexical.update(() => {
        const node = $getNodeByKey(key);
        if (!$isCalloutNode(node)) return;
        node.setVariant(names[(names.indexOf(node.getVariant()) + 1) % names.length] ?? 'note');
      });
    };
    return mergeRegister(
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('pointerdown', onPointerDown);
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('pointerdown', onPointerDown);
        root?.addEventListener('click', onClick);
      }),
      // Never empty: a paragraph to type in.
      lexical.registerNodeTransform(CalloutNode, (node) => {
        if (node.isEmpty()) node.append($createParagraphNode());
        else {
          for (const child of node.getChildren()) {
            if (!$isElementNode(child) && child.isInline()) {
              child.replace($createParagraphNode()).append(child);
            }
          }
        }
      }),
      lexical.registerCommand(KEY_BACKSPACE_COMMAND, $backspace, COMMAND_PRIORITY_LOW),
      lexical.registerCommand(KEY_ENTER_COMMAND, $enter, COMMAND_PRIORITY_LOW),
    );
  },
  commands: {
    setCallout: {
      run: (_ctx, variant?: string) => {
        if (!$knows(variant)) return false;
        const current = $getCallout();
        if (current) {
          if (variant) current.setVariant(variant);
          return;
        }
        if (!$wrap(variant)) return false;
      },
      can: (_ctx, variant?: string) =>
        $knows(variant) && ($getCallout() !== null || $selectedBlocks().length > 0),
    },
    toggleCallout: {
      run: (_ctx, variant?: string) => {
        if (!$knows(variant)) return false;
        const current = $getCallout();
        if (current) {
          if (variant && current.getVariant() !== variant) current.setVariant(variant);
          else $unwrap(current);
          return;
        }
        if (!$wrap(variant)) return false;
      },
      can: (_ctx, variant?: string) =>
        $knows(variant) && ($getCallout() !== null || $selectedBlocks().length > 0),
    },
    setCalloutVariant: {
      run: (_ctx, variant: string, key?: NodeKey) => {
        const node = $getCallout(key);
        if (!node || !$variant(String(variant))) return false;
        node.setVariant(variant);
      },
      can: (_ctx, variant?: string, key?: NodeKey) =>
        $getCallout(key) !== null && (variant === undefined || $variant(variant) !== undefined),
    },
    unsetCallout: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getCallout(key);
        if (!node) return false;
        $unwrap(node);
      },
      can: (_ctx, key?: NodeKey) => $getCallout(key) !== null,
    },
    openCalloutMenu: {
      run: ({ storage }, key?: NodeKey) => {
        const node = $getCallout(key);
        if (!node || !hasUi(storage.menu)) return false;
        // Its items act on the callout the caret is in: put it there.
        if ($getCallout()?.getKey() !== node.getKey()) node.getFirstChild()?.selectStart();
        storage.menuFor.value = node.getKey();
        return requestUi(storage.menu);
      },
      can: ({ storage }, key?: NodeKey) => hasUi(storage.menu) && $getCallout(key) !== null,
    },
  },
  active: {
    callout: () => $getCallout() !== null,
    calloutVariant: (_ctx, variant: string) => $getCallout()?.getVariant() === variant,
  },
  icons: { callout: calloutIcon, lightbulb, messageWarning, triangleAlert, octagonAlert, trash },
  messages: {
    'block.callout': 'Callout',
    'block.callout.description': 'Set a note, tip or warning apart',
    'callout.menu': 'Callout',
    'callout.note': 'Note',
    'callout.tip': 'Tip',
    'callout.important': 'Important',
    'callout.warning': 'Warning',
    'callout.caution': 'Caution',
    'callout.remove': 'Remove callout',
  },
  items: [
    {
      id: 'callout',
      label: 'block.callout',
      description: 'block.callout.description',
      icon: 'callout',
      in: ['slash', 'blockMenu'],
      group: 'basic',
      order: 22,
      keywords: ['callout', 'note', 'tip', 'warning', 'alert', 'admonition', 'info'],
      command: 'setCallout',
      active: 'callout',
    },
    ...CALLOUT_VARIANTS.map((variant, i) => ({
      id: `callout-${variant.name}`,
      label: variant.label,
      icon: variant.icon,
      in: ['calloutMenu'] as const,
      group: 'callout',
      order: i,
      command: 'setCalloutVariant' as const,
      args: [variant.name],
      active: 'calloutVariant' as const,
      activeArgs: [variant.name],
      visible: (editor: TeiEditor) =>
        getPeerOptions<CalloutOptions>(editor.lexical, CALLOUT_EXTENSION)?.variants.some(
          (v) => v.name === variant.name,
        ) ?? false,
    })),
    {
      id: 'unsetCallout',
      label: 'callout.remove',
      icon: 'trash',
      in: ['calloutMenu'],
      group: 'calloutRemove',
      command: 'unsetCallout',
    },
  ],
});
