import {
  configExtension,
  getExtensionDependencyFromEditor,
  type Signal,
  signal,
} from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { MultilineElementTransformer, TextMatchTransformer } from '@lexical/markdown';
import {
  $addUpdateTag,
  $createParagraphNode,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_MERGE_TAG,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension, type TeiExtension } from '../../core/define.js';
import {
  $caretAfter,
  $insertBlockAtSelection,
  $liftBlock,
  $removeBlockHost,
  $selectNode,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import { radical, sigma, trash } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';
import {
  $createEquationNode,
  $isEquationNode,
  cleanTeX,
  EQUATION_EXTENSION,
  EquationNode,
  MAX_EQUATION_LENGTH,
  paintEquation,
} from './node.js';
import { type KatexLike, type KatexSource, katexNow, loadKatex } from './render.js';

export type { SerializedEquationNode } from './node.js';
export {
  $createEquationNode,
  $isEquationNode,
  cleanTeX,
  EQUATION_EXTENSION,
  EquationNode,
  MAX_EQUATION_LENGTH,
} from './node.js';
export type { KatexLike, KatexSource } from './render.js';
export { KATEX_OPTIONS, renderMath, sanitizeMath } from './render.js';

export interface EquationOptions {
  /**
   * KaTeX, which turns TeX into MathML. By default it is loaded with
   * `import('katex')` the first time an equation shows in the page, so it
   * costs nothing until then. Pass the module itself to render at once
   * (on a server: `import katex from 'katex'`), your own loader, or `null`
   * to show the TeX only.
   */
  katex: KatexSource;
  /** The longest TeX an equation takes, in characters. Default 10 000. */
  maxLength: number;
}

/** What `insertEquation` puts in. */
export interface InsertEquation {
  /** The TeX. Default: the selected text, if any, else empty. */
  equation?: string;
  /**
   * In the line of text, or a block of its own. Default: in the line
   * when there is text there (or selected), a block on an empty line.
   */
  inline?: boolean;
  /** Open the editor on it, where there is a UI. Default: when it is empty. */
  edit?: boolean;
}

export interface EquationStorage {
  /** `openEquationEditor`'s requests to the UI. */
  readonly editor: UiRequest;
  /** The equation the editor is for. */
  readonly editFor: Signal<NodeKey | null>;
  /** KaTeX, loaded from the `katex` option; `null` when there is none. */
  readonly load: () => Promise<KatexLike | null>;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** An equation at the caret: in the line, or a block. */
    insertEquation: [options?: InsertEquation];
    /** New TeX for the selected equation (or the one with `key`). */
    setEquation: [equation: string, key?: NodeKey];
    /** Make the equation inline (in its line of text) or a block; without `inline`, toggle. */
    setEquationInline: [inline?: boolean, key?: NodeKey];
    /** Open the editor on the selected equation (or the one with `key`), where there is a UI. */
    openEquationEditor: [key?: NodeKey];
    removeEquation: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** An equation is selected. */
    equation: [];
    /** The selected equation is in a line of text. */
    equationInline: [];
  }
}

/** The equation with this key, else the selected one. */
export function $getEquation(key?: NodeKey): EquationNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isEquationNode(node) ? node : null;
  }
  const selection = $getSelection();
  const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
  return nodes.length === 1 && $isEquationNode(nodes[0]) ? nodes[0] : null;
}

/** The extension itself, for transformers to find its storage. */
let self: TeiExtension<string, EquationOptions, EquationStorage> | undefined;

function storageOf(lexical: LexicalEditor): EquationStorage | undefined {
  try {
    return self ? getExtensionDependencyFromEditor(lexical, self).output.storage : undefined;
  } catch {
    return undefined;
  }
}

/** Ask the UI for the editor on this equation; `false` when there is no UI. */
function openEditor(storage: EquationStorage | undefined, node: EquationNode): boolean {
  if (!storage || !hasUi(storage.editor)) return false;
  storage.editFor.value = node.getKey();
  return requestUi(storage.editor);
}

/** Where an equation can go: a caret, a text selection, or a selected node (it goes after). */
function $canInsert(): boolean {
  const selection = $getSelection() ?? $getPreviousSelection();
  return $isRangeSelection(selection) || $isNodeSelection(selection);
}

/** The block the caret is in has text. */
function $caretLineHasText(): boolean {
  const selection = $getSelection() ?? $getPreviousSelection();
  if (!$isRangeSelection(selection)) return false;
  if (!selection.isCollapsed()) return true;
  const block = selection.anchor.getNode().getTopLevelElement();
  return block !== null && block.getTextContentSize() > 0;
}

/** The caret after an equation: in its line for an inline one, the block after for a block. */
function $leave(node: EquationNode): void {
  if (node.isInline()) node.selectNext(0, 0);
  else $caretAfter(node);
}

// -- HTML ---------------------------------------------------------------------

/** UTF-8 base64, as Lexical's playground writes `data-lexical-equation`. */
function decodeBase64(text: string): string | null {
  try {
    const binary = atob(text);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The TeX a MathML `<math>` was made from, if it says: KaTeX's annotation, or `alttext`. */
function texOfMath(math: Element): string | null {
  for (const annotation of Array.from(math.getElementsByTagName('annotation'))) {
    if (annotation.getAttribute('encoding') === 'application/x-tex') {
      return annotation.textContent ?? '';
    }
  }
  const alt = math.getAttribute('alttext');
  if (alt === null) return null;
  // MediaWiki's `{\displaystyle …}`.
  const wrapped = /^\{\\displaystyle\s*([\s\S]*)\}$/.exec(alt.trim());
  return wrapped ? (wrapped[1] ?? '') : alt;
}

const $equation = (tex: string | null, inline: boolean): LexicalNode[] | null => {
  const clean = tex === null ? null : cleanTeX(tex.trim());
  return clean ? [$createEquationNode(clean, inline)] : null;
};

/**
 * Our own `data-tei-equation` (exact, from `data-tex`; else its `<code>`),
 * Lexical's `data-lexical-equation`, and KaTeX's markup as other pages
 * have it (`.katex`, `.katex-display`).
 */
const EQUATION_RULE = defineImportRule({
  name: EQUATION_EXTENSION,
  match: sel.tag('span', 'div'),
  $import: (_ctx, el, $next) => {
    const kind = el.getAttribute('data-tei-equation');
    if (kind !== null) {
      const tex = el.getAttribute('data-tex') ?? el.querySelector('code')?.textContent ?? null;
      return $equation(tex, kind !== 'block') ?? [];
    }
    const lexical = el.getAttribute('data-lexical-equation');
    if (lexical !== null) {
      const tex = decodeBase64(lexical);
      return $equation(tex, el.getAttribute('data-lexical-inline') === 'true') ?? $next();
    }
    if (el.classList.contains('katex') || el.classList.contains('katex-display')) {
      const math = el.getElementsByTagName('math')[0];
      const display =
        el.classList.contains('katex-display') || math?.getAttribute('display') === 'block';
      return (math && $equation(texOfMath(math), !display)) ?? $next();
    }
    return $next();
  },
});

/**
 * A bare `<math>` that says its TeX (Wikipedia's, MathJax's); others stay
 * their text. Any element, checked by name: a `<math>` in a browser is
 * MathML, whose lower-case `nodeName` no tag rule matches.
 */
const MATH_RULE = defineImportRule({
  name: `${EQUATION_EXTENSION}/math`,
  match: sel.any(),
  $import: (_ctx, el, $next) =>
    el.localName.toLowerCase() === 'math'
      ? ($equation(texOfMath(el), el.getAttribute('display') !== 'block') ?? $next())
      : $next(),
});

// -- Markdown -----------------------------------------------------------------

/**
 * `$x^2$`: the dollar signs hug the TeX, and the closing one has no digit
 * after it, so `$5 and $10` stays text (Pandoc's rule).
 */
const INLINE_TEX = /(?<![\\$])\$(?![\s$])((?:\\.|[^$\\\n])*?(?:\\.|[^\s$\\]))\$(?![\d$])/;

/** `$$x$$` typed on a line of its own, or `$x$` anywhere. */
const TYPED_TEX = new RegExp(`(?:^\\$\\$((?:\\\\.|[^$\\\\])+?)\\$\\$|${INLINE_TEX.source})$`);

/** In a line: `$x^2$`; a block is the multiline transformer's. */
export const INLINE_EQUATION: TextMatchTransformer = {
  dependencies: [EquationNode],
  export: (node) => {
    if (!$isEquationNode(node) || !node.isInline()) return null;
    const tex = node.getEquation().replace(/\s+/g, ' ').trim();
    return tex ? `$${tex}$` : '';
  },
  importRegExp: INLINE_TEX,
  regExp: TYPED_TEX,
  replace: (textNode, match) => {
    const block = match[0].startsWith('$$');
    const tex = cleanTeX(block ? (match[1] ?? '') : (match[match.length - 1] ?? ''));
    if (!tex) return;
    const parent = textNode.getParent();
    if (block && parent && parent.getTextContent() === match[0]) {
      const node = $createEquationNode(tex, false);
      parent.replace(node);
      $caretAfter(node);
      return;
    }
    const node = $createEquationNode(tex, true);
    textNode.replace(node);
    node.selectNext(0, 0);
  },
  trigger: '$',
  type: 'text-match',
};

const CLOSE = /^([\s\S]*?)\$\$\s*$/;

/**
 * `$$ … $$` on lines of their own, or `$$x$$` on one. Typing `$$` and a
 * space on an empty line makes an empty one and opens its editor.
 */
export const BLOCK_EQUATION: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [EquationNode],
  regExpStart: /^\$\$/,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    const first = (lines[startLineIndex] ?? '').slice(2);
    const body: string[] = [];
    let end = startLineIndex;
    const one = CLOSE.exec(first);
    if (one) body.push(one[1] ?? '');
    else {
      body.push(first);
      for (;;) {
        end++;
        if (end >= lines.length) return null;
        const close = CLOSE.exec(lines[end] ?? '');
        if (close) {
          body.push(close[1] ?? '');
          break;
        }
        body.push(lines[end] ?? '');
      }
    }
    const tex = cleanTeX(body.join('\n').trim());
    if (tex === null) return null;
    rootNode.append($createEquationNode(tex, false));
    return [true, end];
  },
  replace: (rootNode, children, _start, _end, _lines, isImport) => {
    if (isImport) return false;
    const node = $createEquationNode('', false);
    rootNode.replace(node);
    if (children?.length) node.insertAfter($createParagraphNode().append(...children));
    if (!openEditor(storageOf($getEditor()), node)) $caretAfter(node);
    else $selectNode(node);
  },
  export: (node) => {
    if (!$isEquationNode(node) || node.isInline()) return null;
    const tex = node.getEquation().trim();
    return tex.includes('\n') ? `$$\n${tex}\n$$` : `$$${tex}$$`;
  },
};

// -- Extension ----------------------------------------------------------------

/**
 * Equations in TeX: in a line of text (`$x^2$`) or a block of their own
 * (`$$…$$`), drawn as MathML by KaTeX. KaTeX loads the first time an
 * equation shows, so it costs nothing before; until it has (or where it
 * is not installed) an equation shows its TeX. A click on one, or Enter
 * with it selected, opens its editor where the UI has one. Saved as
 * `<span data-tei-equation data-tex>` (a `<div>` for a block) with the
 * MathML in it, which needs no stylesheet and no script to show, and reads
 * back exactly; MathML and KaTeX markup from other pages read in too.
 *
 * In React, `<EquationEditor>` is the editor.
 */
export const Equation = defineTeiExtension({
  name: EQUATION_EXTENSION,
  config: {
    // The literal specifier keeps KaTeX a chunk of its own in an app's bundle.
    katex: () => import('katex'),
    maxLength: MAX_EQUATION_LENGTH,
  } as EquationOptions,
  nodes: [EquationNode],
  dependencies: [
    RichText,
    configExtension(DOMImportExtension, { rules: [EQUATION_RULE, MATH_RULE] }),
  ],
  storage: ({ options }): EquationStorage => ({
    editor: uiRequest(),
    editFor: signal(null),
    load: () => loadKatex(options.katex),
  }),
  markdown: { inlineEquation: INLINE_EQUATION, blockEquation: BLOCK_EQUATION },
  register: (ctx) => {
    const { lexical, editor, storage, options } = ctx;
    const keys = new Set<NodeKey>();
    let waiting = false;
    /** Each equation in the page drawn again: KaTeX has come. */
    const repaint = () =>
      lexical.read(() => {
        const katex = katexNow(options.katex);
        for (const key of keys) {
          const node = $getNodeByKey(key);
          const dom = lexical.getElementByKey(key);
          if ($isEquationNode(node) && dom) {
            paintEquation(dom, node.getEquation(), !node.isInline(), katex);
            label(dom);
          }
        }
      });
    /** What an empty equation shows, in the editor's language. */
    const label = (dom: HTMLElement) => {
      const placeholder = editor.t('equation.placeholder');
      dom.setAttribute('data-placeholder', placeholder);
      if (dom.hasAttribute('data-empty')) dom.setAttribute('aria-label', placeholder);
    };
    // A click on an equation opens its editor, when there is one.
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.('[data-tei-equation]');
      if (!target || !lexical.isEditable() || !hasUi(storage.editor)) return;
      const key = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(target);
        return $isEquationNode(node) ? node.getKey() : null;
      });
      if (key !== null) editor.commands.openEquationEditor(key);
    };
    return mergeRegister(
      registerHostSelection(lexical, $isEquationNode),
      registerSelectedAttribute(lexical, $isEquationNode),
      // A block keeps to the top of its root; an inline one needs a line.
      lexical.registerNodeTransform(EquationNode, (node) => {
        if (!node.isInline()) $liftBlock(node);
        else if ($isRootOrShadowRoot(node.getParent())) {
          const line = $createParagraphNode();
          node.replace(line);
          line.append(node);
        }
      }),
      lexical.registerMutationListener(
        EquationNode,
        (mutations) => {
          for (const [key, kind] of mutations) {
            if (kind === 'destroyed') {
              keys.delete(key);
              continue;
            }
            keys.add(key);
            const dom = lexical.getElementByKey(key);
            if (dom) label(dom);
          }
          // KaTeX, the first time an equation is in the page.
          if (keys.size > 0 && !waiting && !katexNow(options.katex) && lexical.getRootElement()) {
            waiting = true;
            void storage.load().then((katex) => {
              if (katex) repaint();
            });
          }
        },
        { skipInitialization: false },
      ),
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('click', onClick);
      }),
      lexical.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const node = $getEquation();
          if (!node || !openEditor(storage, node)) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  },
  commands: {
    insertEquation: {
      run: ({ storage, options }, insert?: InsertEquation) => {
        if (!$canInsert()) return false;
        let selection = $getSelection();
        const previous = $getPreviousSelection();
        if (!selection && previous) {
          $setSelection(previous.clone());
          selection = $getSelection();
        }
        const selected = $isRangeSelection(selection) ? selection.getTextContent() : '';
        const tex = cleanTeX(insert?.equation ?? selected, options.maxLength);
        if (tex === null) return false;
        const inline = insert?.inline ?? $caretLineHasText();
        const node = $createEquationNode(tex.trim(), inline);
        if (inline) {
          if (!$isRangeSelection(selection)) return false;
          selection.insertNodes([node]);
        } else $insertBlockAtSelection(node);
        const edit = insert?.edit ?? tex.trim() === '';
        if (edit && openEditor(storage, node)) $selectNode(node);
        else $leave(node);
      },
      can: ({ options }, insert?: InsertEquation) =>
        $canInsert() &&
        (insert?.equation === undefined || cleanTeX(insert.equation, options.maxLength) !== null),
    },
    setEquation: {
      run: ({ options }, equation: string, key?: NodeKey) => {
        const node = $getEquation(key);
        const tex = cleanTeX(equation, options.maxLength);
        if (!node || tex === null) return false;
        if (tex !== node.getEquation()) node.setEquation(tex);
      },
      can: ({ options }, equation?: string, key?: NodeKey) =>
        $getEquation(key) !== null &&
        (equation === undefined || cleanTeX(equation, options.maxLength) !== null),
    },
    setEquationInline: {
      run: (_ctx, inline?: boolean, key?: NodeKey) => {
        const node = $getEquation(key);
        if (!node) return false;
        const next = inline ?? !node.isInline();
        if (next !== node.isInline()) node.setInline(next);
        $selectNode(node);
      },
      can: (_ctx, _inline?: boolean, key?: NodeKey) => $getEquation(key) !== null,
    },
    openEquationEditor: {
      run: ({ storage }, key?: NodeKey) => {
        const node = $getEquation(key);
        return node !== null && openEditor(storage, node);
      },
      can: ({ storage }, key?: NodeKey) => hasUi(storage.editor) && $getEquation(key) !== null,
    },
    removeEquation: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getEquation(key);
        if (!node) return false;
        // An empty one leaving is no step of its own to undo.
        if (node.getEquation() === '') $addUpdateTag(HISTORY_MERGE_TAG);
        if (!node.isInline()) {
          $removeBlockHost(node);
          return;
        }
        const before = node.getPreviousSibling();
        if (before) before.selectEnd();
        else node.selectPrevious();
        node.remove();
      },
      can: (_ctx, key?: NodeKey) => $getEquation(key) !== null,
    },
  },
  active: {
    equation: () => $getEquation() !== null,
    equationInline: () => $getEquation()?.isInline() === true,
  },
  keymap: {
    insertEquation: { key: 'Mod-Shift-m', command: 'insertEquation', args: [{ inline: true }] },
  },
  icons: { sigma, radical, trash },
  messages: {
    'equation.insert': 'Equation',
    'equation.insert.description': 'A mathematical formula in TeX',
    'equation.inline': 'Inline equation',
    'equation.inline.description': 'A formula in the line of text',
    'equation.placeholder': 'New equation',
    'equation.editor': 'Equation',
    'equation.input': 'TeX',
    'equation.input.placeholder': 'e^{i\\pi} + 1 = 0',
    'equation.preview': 'Preview',
    'equation.hint': 'Enter to save, Shift+Enter for a new line, Escape to cancel.',
    'equation.error': 'This TeX has a mistake: {message}',
    'equation.noRenderer': 'Shown as TeX: KaTeX is not available.',
    'equation.display': 'Display (block)',
    'equation.done': 'Done',
    'equation.remove': 'Remove equation',
  },
  items: [
    {
      id: 'insertEquation',
      label: 'equation.insert',
      description: 'equation.insert.description',
      icon: 'sigma',
      in: ['toolbar', 'slash', 'insert'],
      group: 'insert',
      order: 60,
      keywords: ['equation', 'math', 'formula', 'tex', 'latex', 'katex'],
      command: 'insertEquation',
    },
    {
      id: 'insertInlineEquation',
      label: 'equation.inline',
      description: 'equation.inline.description',
      icon: 'radical',
      in: ['slash'],
      group: 'insert',
      order: 61,
      keywords: ['inline', 'equation', 'math', 'formula', 'tex', 'latex'],
      shortcut: 'insertEquation',
      command: 'insertEquation',
      args: [{ inline: true }],
    },
  ],
});

self = Equation;
