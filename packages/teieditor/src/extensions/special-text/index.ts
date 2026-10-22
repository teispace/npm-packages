import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { TextMatchTransformer } from '@lexical/markdown';
import {
  $addUpdateTag,
  $applyNodeReplacement,
  $createTextNode,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_HIGH,
  COMPOSITION_END_TAG,
  DELETE_CHARACTER_COMMAND,
  type DOMExportOutput,
  type EditorConfig,
  HISTORIC_TAG,
  HISTORY_PUSH_TAG,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  PASTE_TAG,
  type SerializedTextNode,
  TextNode,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import { RichText } from '../rich-text/index.js';

export const SPECIAL_TEXT_EXTENSION = '@teispace/teieditor/special-text';

/** The tag on the update that makes a replacement. */
export const SPECIAL_TEXT_TAG = 'tei-special-text';

/** A replacement made as you type: `--` → `—`. */
export interface TextReplacement {
  /**
   * What triggers it: text that ends where the caret is, or a pattern run
   * on the text before the caret (anchor it with `$`, or with a lookahead
   * for the character just typed).
   */
  match: string | RegExp;
  /** What takes the match's place. */
  replace: string;
}

/** Opening and closing quotes, `['“', '”']`. */
export type QuotePair = readonly [open: string, close: string];

export interface SpecialTextOptions {
  /**
   * Replacements by name. Configure merges by name, so
   * `{ replacements: { oneHalf: null } }` turns one off and keeps the rest.
   */
  replacements: Readonly<Record<string, TextReplacement | null>>;
  /** Curly quotes for `"` and `'`, or `null` to leave quotes straight. Default English. */
  quotes: { double: QuotePair; single: QuotePair } | null;
  /** Style `[text]` as special text when its `]` is typed. Default false. */
  brackets: boolean;
}

/** A fraction typed alone, once the character after it shows it is not `1/20`. */
const fraction = (digits: string) => new RegExp(`(?<![\\d/])${digits}(?=[\\s.,;:!?)]$)`);

export const DEFAULT_REPLACEMENTS: Readonly<Record<string, TextReplacement>> = {
  // Not at the start of a line, where `---` is a markdown rule.
  emDash: { match: /(?<=[^\s-]\s?)--$/, replace: '—' },
  ellipsis: { match: '...', replace: '…' },
  copyright: { match: /\(c\)$/i, replace: '©' },
  registered: { match: /\(r\)$/i, replace: '®' },
  trademark: { match: /\(tm\)$/i, replace: '™' },
  rightArrow: { match: '->', replace: '→' },
  leftArrow: { match: '<-', replace: '←' },
  oneHalf: { match: fraction('1/2'), replace: '½' },
  oneQuarter: { match: fraction('1/4'), replace: '¼' },
  threeQuarters: { match: fraction('3/4'), replace: '¾' },
};

export const ENGLISH_QUOTES: SpecialTextOptions['quotes'] = {
  double: ['“', '”'],
  single: ['‘', '’'],
};

// -- The special-text node ----------------------------------------------------

/**
 * Text set apart as special: the playground's `[bracketed]` text, without
 * its brackets. Saved as `<span data-tei-special-text>`; in markdown, in
 * its brackets again.
 */
export class SpecialTextNode extends TextNode {
  static getType(): string {
    return 'special-text';
  }

  static clone(node: SpecialTextNode): SpecialTextNode {
    return new SpecialTextNode(node.__text, node.__key);
  }

  static importJSON(json: SerializedTextNode): SpecialTextNode {
    return $createSpecialTextNode().updateFromJSON(json);
  }

  createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config, editor);
    dom.classList.add((config.theme.specialText as string | undefined) ?? 'tei-special-text');
    return dom;
  }

  updateDOM(prev: this, dom: HTMLElement, config: EditorConfig): boolean {
    const replace = super.updateDOM(prev, dom, config);
    // A change of format rewrites the class.
    dom.classList.add((config.theme.specialText as string | undefined) ?? 'tei-special-text');
    return replace;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);
    const element = output.element;
    if (element && element.nodeType === 1) {
      const span = element.ownerDocument.createElement('span');
      span.setAttribute('data-tei-special-text', '');
      span.append(element);
      return { ...output, element: span };
    }
    return output;
  }

  /** Typing at its edges goes outside it. */
  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createSpecialTextNode(text = ''): SpecialTextNode {
  return $applyNodeReplacement(new SpecialTextNode(text));
}

export function $isSpecialTextNode(node: LexicalNode | null | undefined): node is SpecialTextNode {
  return node instanceof SpecialTextNode;
}

const SPECIAL_TEXT_RULE = defineImportRule({
  name: SPECIAL_TEXT_EXTENSION,
  match: sel.tag('span').attr('data-tei-special-text', true),
  $import: (_ctx, _el, $next) =>
    $next().map((node) =>
      $isTextNode(node) && !$isSpecialTextNode(node)
        ? $createSpecialTextNode(node.getTextContent())
            .setFormat(node.getFormat())
            .setStyle(node.getStyle())
        : node,
    ),
});

/** `[text]`, not a link's `[text](url)`, a reference `[text]:` or an image's `![alt]`. */
const BRACKETED = /(?<!!)\[([^[\]\n]+)\](?![([:])/;
const BRACKETED_TYPED = /(?<!!)\[([^[\]\n]+)\](?=[\s.,;!?)]$)/;

function bracketsOn(): boolean {
  try {
    return (
      getPeerOptions<SpecialTextOptions>($getEditor(), SPECIAL_TEXT_EXTENSION)?.brackets ?? false
    );
  } catch {
    return false;
  }
}

/** `[text]` in markdown, read back as special text only while `brackets` is on. */
export const SPECIAL_TEXT: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [SpecialTextNode],
  export: (node) => ($isSpecialTextNode(node) ? `[${node.getTextContent()}]` : null),
  importRegExp: BRACKETED,
  // No `trigger`: typing is this extension's own, and undoes in one step.
  regExp: new RegExp(`${BRACKETED.source}$`),
  replace: (textNode, match) => {
    if (!bracketsOn()) return;
    textNode.replace(
      $createSpecialTextNode(match[1] ?? '')
        .setFormat(textNode.getFormat())
        .setStyle(textNode.getStyle()),
    );
  },
};

// -- Replacing as you type ----------------------------------------------------

/** Text in a code block or inline code: never replaced. */
function $inCode(node: TextNode): boolean {
  const parent = node.getParent();
  return (
    node.hasFormat('code') || node.getType() === 'code-highlight' || parent?.getType() === 'code'
  );
}

/** The character before `offset` in the line: in this node, or at the end of the one before. */
function $charBefore(node: TextNode, offset: number): string {
  if (offset > 0) return node.getTextContent()[offset - 1] ?? '';
  const prev = node.getPreviousSibling();
  return $isTextNode(prev) ? prev.getTextContent().slice(-1) : '';
}

/** Whether a quote here opens: at the start of a line, or after a space, an opening bracket or a dash. */
const opensAfter = (char: string) => char === '' || /[\s([{<—–\-“‘]/.test(char);

interface Replacement {
  start: number;
  length: number;
  text: string;
  /** Becomes special text, without its brackets. */
  special?: boolean;
}

/** The replacement due for the character just typed before `offset`, if any. */
function $replacementFor(
  node: TextNode,
  offset: number,
  options: SpecialTextOptions,
): Replacement | null {
  const before = node.getTextContent().slice(0, offset);
  const typed = before.slice(-1);
  if (options.quotes && (typed === '"' || typed === "'")) {
    const pair = typed === '"' ? options.quotes.double : options.quotes.single;
    const open = opensAfter($charBefore(node, offset - 1));
    return { start: offset - 1, length: 1, text: open ? pair[0] : pair[1] };
  }
  // `[text]` once the character after it shows it is not a link's `[text](`.
  if (options.brackets && before.at(-2) === ']') {
    const match = BRACKETED_TYPED.exec(before);
    if (match) {
      return { start: match.index, length: match[0].length, text: match[1] ?? '', special: true };
    }
  }
  // Only the last 64 characters: enough for any rule, and cheap on a long line.
  const tail = before.slice(-64);
  const shift = before.length - tail.length;
  for (const rule of Object.values(options.replacements)) {
    if (!rule) continue;
    if (typeof rule.match === 'string') {
      if (rule.match && tail.endsWith(rule.match)) {
        return {
          start: before.length - rule.match.length,
          length: rule.match.length,
          text: rule.replace,
        };
      }
      continue;
    }
    const match = rule.match.exec(tail);
    if (match?.[0])
      return { start: shift + match.index, length: match[0].length, text: rule.replace };
  }
  return null;
}

/**
 * The text node a character was just typed into, and where: the caret
 * moved one on, and the text is the old text with that one character.
 */
function typedAt(
  editor: LexicalEditor,
  payload: Parameters<Parameters<LexicalEditor['registerUpdateListener']>[0]>[0],
): { key: NodeKey; offset: number } | null {
  const { editorState, prevEditorState, dirtyLeaves, tags } = payload;
  if (
    tags.has(HISTORIC_TAG) ||
    tags.has(COLLABORATION_TAG) ||
    tags.has(PASTE_TAG) ||
    tags.has(COMPOSITION_END_TAG) ||
    tags.has(SPECIAL_TEXT_TAG) ||
    editor.isComposing() ||
    dirtyLeaves.size === 0
  ) {
    return null;
  }
  return editorState.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
    const { key, offset } = selection.anchor;
    const node = selection.anchor.getNode();
    if (!$isTextNode(node) || offset < 1 || !dirtyLeaves.has(key) || $inCode(node)) return null;
    const text = node.getTextContent();
    const expected = text.slice(0, offset - 1) + text.slice(offset);
    const was = prevEditorState.read(() => {
      const prev = $getNodeByKey(key);
      const prevSelection = $getSelection();
      if (!$isTextNode(prev)) return expected === '' ? '' : null;
      if (!$isRangeSelection(prevSelection) || prevSelection.anchor.key !== key) return null;
      return prevSelection.anchor.offset === offset - 1 ? prev.getTextContent() : null;
    });
    return was === expected ? { key, offset } : null;
  });
}

/** What to undo with Backspace straight after a replacement. */
interface Undoable {
  key: NodeKey;
  /** Where the caret is right after it. */
  offset: number;
  $undo: () => void;
}

type Ctx = { lexical: LexicalEditor; options: SpecialTextOptions };

function register({ lexical, options }: Ctx): () => void {
  let last: Undoable | null = null;

  const $apply = (key: NodeKey, offset: number) => {
    const node = $getNodeByKey(key);
    const selection = $getSelection();
    // Only while the caret is still where the character was typed.
    if (
      !$isTextNode(node) ||
      !$isRangeSelection(selection) ||
      !selection.isCollapsed() ||
      selection.anchor.key !== key ||
      selection.anchor.offset !== offset
    )
      return;
    const found = $replacementFor(node, offset, options);
    if (!found) return;
    const original = node.getTextContent().slice(found.start, found.start + found.length);
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(SPECIAL_TEXT_TAG);
    if (found.special) {
      const parts = node.splitText(found.start, found.start + found.length);
      const target = found.start === 0 ? parts[0] : parts[1];
      if (!target) return;
      const special = $createSpecialTextNode(found.text)
        .setFormat(target.getFormat())
        .setStyle(target.getStyle());
      target.replace(special);
      // The caret stays after the character typed, in the text after it.
      const caret = $getSelection();
      if (!$isRangeSelection(caret)) return;
      const at = { key: caret.anchor.key, offset: caret.anchor.offset };
      last = {
        ...at,
        $undo: () => {
          const current = $getNodeByKey(special.getKey());
          if (!$isSpecialTextNode(current)) return;
          current.replace(
            $createTextNode(original).setFormat(current.getFormat()).setStyle(current.getStyle()),
          );
          $getNodeByKey<TextNode>(at.key)?.select(at.offset, at.offset);
        },
      };
      return;
    }
    // The caret stays after the character typed, which may follow the match (`1/2 `).
    const caret = offset - found.length + found.text.length;
    node.spliceText(found.start, found.length, found.text).select(caret, caret);
    last = {
      key,
      offset: caret,
      $undo: () => {
        const current = $getNodeByKey(key);
        if (!$isTextNode(current)) return;
        current.spliceText(found.start, found.text.length, original).select(offset, offset);
      },
    };
  };

  /** Backspace straight after a replacement takes it back. */
  const $backspace = (event: KeyboardEvent | null): boolean => {
    const undoable = last;
    const selection = $getSelection();
    if (!undoable || !$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    if (selection.anchor.key !== undoable.key || selection.anchor.offset !== undoable.offset)
      return false;
    last = null;
    event?.preventDefault();
    $addUpdateTag(HISTORY_PUSH_TAG);
    $addUpdateTag(SPECIAL_TEXT_TAG);
    undoable.$undo();
    return true;
  };

  return mergeRegister(
    lexical.registerUpdateListener((payload) => {
      if (payload.tags.has(SPECIAL_TEXT_TAG)) return;
      // Anything else written forgets the last replacement.
      if (payload.dirtyLeaves.size > 0 || payload.dirtyElements.size > 0) last = null;
      const at = typedAt(lexical, payload);
      // Discrete: it lands before the next key, or the caret moves on without it.
      if (at) lexical.update(() => $apply(at.key, at.offset), { discrete: true });
    }),
    lexical.registerCommand(KEY_BACKSPACE_COMMAND, $backspace, COMMAND_PRIORITY_HIGH),
    // Android deletes through beforeinput, with no Backspace key.
    lexical.registerCommand(
      DELETE_CHARACTER_COMMAND,
      (backward) => backward && $backspace(null),
      COMMAND_PRIORITY_HIGH,
    ),
  );
}

/**
 * Typography as you type: curly quotes, `--` to an em dash, `...` to an
 * ellipsis, `(c)` to ©, `->` to →, `1/2` to ½, and any replacement you add.
 * Each is its own undo step: ⌘Z, or Backspace straight after, gives the
 * typed text back. With `brackets`, `[text]` becomes special text. Never in
 * code, never mid-composition, never on paste.
 */
export const SpecialText = defineTeiExtension({
  name: SPECIAL_TEXT_EXTENSION,
  config: {
    replacements: DEFAULT_REPLACEMENTS,
    quotes: ENGLISH_QUOTES,
    brackets: false,
  } as SpecialTextOptions,
  mergeConfig: (config, overrides) => ({
    ...config,
    ...overrides,
    replacements: { ...config.replacements, ...overrides.replacements },
  }),
  nodes: [SpecialTextNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [SPECIAL_TEXT_RULE] })],
  markdown: { specialText: SPECIAL_TEXT },
  register: (ctx) => register(ctx as unknown as Ctx),
});
