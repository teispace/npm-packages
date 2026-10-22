import type { AutoLinkExtension } from '@lexical/link';
import { $convertFromMarkdownString, type ElementTransformer } from '@lexical/markdown';
import {
  $addUpdateTag,
  $create,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  declarePeerDependency,
  type EditorConfig,
  ElementNode,
  HISTORY_PUSH_TAG,
  IS_CODE,
  KEY_ENTER_COMMAND,
  type LexicalNode,
  mergeRegister,
  PASTE_COMMAND,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { fileCode } from '../../icons/index.js';
import { Markdown } from '../markdown/index.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Switch between the formatted document and its markdown, as one undo step each way. */
    toggleMarkdownSource: [];
  }
  interface TeiActiveStates {
    markdownSource: [];
  }
}

/**
 * The document as markdown text, while the source view is on: the root's
 * only child. Its text is code-formatted so markdown shortcuts leave what
 * is typed alone; CSS draws it as plain monospace.
 */
export class MarkdownSourceNode extends ElementNode {
  $config() {
    return this.config('markdown-source', { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const pre = $getDocument().createElement('pre');
    pre.className = (config.theme.markdownSource as string | undefined) ?? 'tei-markdown-source';
    pre.setAttribute('data-tei-markdown-source', '');
    pre.setAttribute('spellcheck', 'false');
    return pre;
  }

  updateDOM(): false {
    return false;
  }

  canIndent(): false {
    return false;
  }

  canBeEmpty(): true {
    return true;
  }
}

export function $createMarkdownSourceNode(): MarkdownSourceNode {
  return $create(MarkdownSourceNode);
}

export function $isMarkdownSourceNode(
  node: LexicalNode | null | undefined,
): node is MarkdownSourceNode {
  return node instanceof MarkdownSourceNode;
}

/** The source node, when the source view is on. */
export function $getMarkdownSource(): MarkdownSourceNode | null {
  const first = $getRoot().getFirstChild();
  return $isMarkdownSourceNode(first) ? first : null;
}

/** Lines of text as source children: code-formatted text, line breaks between. */
function $sourceChildren(text: string): LexicalNode[] {
  const out: LexicalNode[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, i) => {
    if (i > 0) out.push($createLineBreakNode());
    if (line) out.push($createTextNode(line).setFormat(IS_CODE));
  });
  return out;
}

/** The selection's anchor inside `node`, as an offset into its text. */
function $offsetIn(node: ElementNode): number {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return 0;
  const { anchor } = selection;
  const target = anchor.getNode();
  let offset = 0;
  const children = node.getChildren();
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as LexicalNode;
    if (anchor.type === 'element' && target.is(node) && i === anchor.offset) return offset;
    if (child.is(target)) return offset + anchor.offset;
    offset += child.getTextContentSize();
  }
  return offset;
}

/** The text of the document before the selection's anchor. */
function $textBeforeCaret(): string {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return '';
  const { anchor } = selection;
  const target = anchor.getNode();
  let prefix = '';
  if ($isTextNode(target)) {
    for (const text of $getRoot().getAllTextNodes()) {
      if (text.is(target)) return prefix + text.getTextContent().slice(0, anchor.offset);
      prefix += text.getTextContent();
    }
    return prefix;
  }
  if (!$isElementNode(target)) return prefix;
  const inside = new Set(
    target
      .getChildren()
      .slice(0, anchor.offset)
      .flatMap((child) =>
        $isElementNode(child) ? child.getAllTextNodes() : $isTextNode(child) ? [child] : [],
      )
      .map((text) => text.getKey()),
  );
  for (const text of $getRoot().getAllTextNodes()) {
    if (!inside.has(text.getKey()) && !text.isBefore(target)) break;
    prefix += text.getTextContent();
  }
  return prefix;
}

const SPACE = /\s/;
const TRAIL = /[\s*_~`]/;

/**
 * Where the end of `prefix` falls in `text`: its non-space characters are
 * found in `text` in order, each within `reach` of the last. What `text`
 * adds (markdown's marks) is stepped over; what it lacks is skipped. Exact
 * where the two agree; close where they don't.
 */
export function alignOffset(prefix: string, text: string, reach = 256): number {
  let at = 0;
  for (const char of prefix) {
    if (SPACE.test(char)) continue;
    const end = Math.min(text.length, at + reach);
    for (let i = at; i < end; i++) {
      if (text[i] === char) {
        at = i + 1;
        break;
      }
    }
  }
  // After a space, past the closing marks and spaces that follow too.
  if (SPACE.test(prefix.at(-1) ?? '')) while (at < text.length && TRAIL.test(text[at] ?? '')) at++;
  return at;
}

/** Markdown's own marks taken out of a stretch of it, leaving roughly its text. */
export function markdownText(markdown: string): string {
  return markdown
    .replace(/\]\([^)\n]*\)/g, '')
    .replace(/^[ \t]*(?:#{1,6}|>+|[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/<!--[^>]*-->|\\(?=[^\s])|[*_~`|[\]!#]/g, '');
}

/** Put a collapsed caret at `offset` into the document's text (its text nodes, run together). */
function $caretAtText(offset: number): void {
  let rest = offset;
  const texts = $getRoot().getAllTextNodes();
  for (const text of texts) {
    const size = text.getTextContentSize();
    if (rest <= size) {
      text.select(rest, rest);
      return;
    }
    rest -= size;
  }
  const last = texts.at(-1);
  if (last) last.select();
  else $getRoot().selectStart();
}

/** Put a collapsed caret at `offset` into a source node's text. */
function $caretInSource(node: MarkdownSourceNode, offset: number): void {
  let rest = offset;
  const children = node.getChildren();
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as LexicalNode;
    const size = child.getTextContentSize();
    if ($isTextNode(child) && rest <= size) {
      child.select(rest, rest);
      return;
    }
    if (rest < size || (rest === 0 && $isLineBreakNode(child))) {
      node.select(i, i);
      return;
    }
    rest -= size;
  }
  node.selectEnd();
}

/** Anything but text and line breaks in the source (a dropped image, a link) becomes its text. */
function $normalizeSource(node: MarkdownSourceNode): void {
  for (const child of node.getChildren()) {
    if ($isLineBreakNode(child)) continue;
    if ($isTextNode(child)) {
      if (child.getFormat() !== IS_CODE) child.setFormat(IS_CODE);
      if (child.getStyle() !== '') child.setStyle('');
      continue;
    }
    const nodes = $sourceChildren(child.getTextContent());
    let last: LexicalNode = child;
    for (const next of nodes) last = last.insertAfter(next);
    child.remove();
  }
  // What the caret types next is source text too.
  const selection = $getSelection();
  if (
    $isRangeSelection(selection) &&
    selection.format !== IS_CODE &&
    $getMarkdownSource()?.is(node) &&
    node.isParentOf(selection.anchor.getNode())
  ) {
    selection.setFormat(IS_CODE);
  }
}

/** Whether the selection is in the source. */
function $inSource(): boolean {
  const source = $getMarkdownSource();
  const selection = $getSelection();
  if (!source || !$isRangeSelection(selection)) return false;
  const node = selection.anchor.getNode();
  return node.is(source) || source.isParentOf(node);
}

/** `getMarkdown()` in the source view is the source as written. */
const SOURCE: ElementTransformer = {
  dependencies: [MarkdownSourceNode],
  export: (node) => ($isMarkdownSourceNode(node) ? node.getTextContent() : null),
  regExp: /(?!)/,
  replace: () => false,
  type: 'element',
};

export interface MarkdownSourceOptions {
  /**
   * Commands that still run in the source view; every other command is
   * refused there, and its buttons are greyed out.
   */
  allow: readonly string[];
}

/**
 * A markdown source view: `toggleMarkdownSource` turns the document into
 * its markdown, as plain text to edit, and back. Both ways go through the
 * editor's installed markdown transformers, are one undo step each, and
 * keep the caret near where it was. While it is on, only the commands in
 * `allow` run. `getMarkdown()` gives the source as written; the other
 * formats see a code-like block, so leave the view before saving them.
 */
export const MarkdownSource = defineTeiExtension({
  name: '@teispace/teieditor/markdown-source',
  config: {
    allow: [
      'toggleMarkdownSource',
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'pastePlain',
      'toggleEditable',
      'setEditable',
      'clearDocument',
      'downloadAs',
      'openFile',
      'toggleInvisibles',
      'togglePages',
    ],
  } as MarkdownSourceOptions,
  nodes: [MarkdownSourceNode],
  dependencies: [RichText, Markdown],
  // Typed links stay text in the source.
  peerDependencies: [
    declarePeerDependency<typeof AutoLinkExtension>('@lexical/link/AutoLink', {
      excludeParents: [$isMarkdownSourceNode],
    }),
  ],
  markdown: { markdownSource: SOURCE },
  commands: {
    toggleMarkdownSource: {
      run: ({ editor }) => {
        const root = $getRoot();
        const source = $getMarkdownSource();
        if (source) {
          const text = source.getTextContent();
          const caret = $offsetIn(source);
          const preserve = editor.extension(Markdown)?.output.options.preserveNewLines.value;
          $convertFromMarkdownString(text, editor.markdownTransformers, undefined, preserve);
          if (root.getChildrenSize() === 0) root.append($createParagraphNode());
          const plain = root
            .getAllTextNodes()
            .map((t) => t.getTextContent())
            .join('');
          $caretAtText(alignOffset(markdownText(text.slice(0, caret)), plain, 64));
        } else {
          const prefix = $textBeforeCaret();
          const markdown = editor.getMarkdown();
          const node = $createMarkdownSourceNode().append(...$sourceChildren(markdown));
          root.clear().append(node);
          $caretInSource(node, alignOffset(prefix, markdown));
        }
        $addUpdateTag(HISTORY_PUSH_TAG);
      },
    },
  },
  active: { markdownSource: () => $getMarkdownSource() !== null },
  middleware: [
    ({ name, ctx }, next) => {
      const allow = ctx.editor.extension(MarkdownSource)?.output.options.allow.value;
      if (!allow || allow.includes(name) || $getMarkdownSource() === null) return next();
      return false;
    },
  ],
  register: ({ lexical }) =>
    mergeRegister(
      lexical.registerNodeTransform(MarkdownSourceNode, $normalizeSource),
      // Enter is a new line of source, never a new block (nor a markdown shortcut's).
      lexical.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!$inSource()) return false;
          event?.preventDefault();
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertLineBreak();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // A paste is its plain text.
      lexical.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!$inSource()) return false;
          const data = (event as ClipboardEvent).clipboardData;
          const text = data?.getData('text/plain') ?? '';
          event.preventDefault();
          const selection = $getSelection();
          if (text && $isRangeSelection(selection)) selection.insertRawText(text);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    ),
  icons: { markdownSource: fileCode },
  messages: { 'view.markdownSource': 'Markdown source' },
  items: [
    {
      id: 'markdownSource',
      label: 'view.markdownSource',
      icon: 'markdownSource',
      in: ['document'],
      group: 'view',
      order: 0,
      command: 'toggleMarkdownSource',
      active: 'markdownSource',
    },
  ],
});
