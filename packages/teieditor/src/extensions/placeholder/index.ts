import { $isListItemNode } from '@lexical/list';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalEditor,
  mergeRegister,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';

export interface PlaceholderOptions {
  /** Shown in an empty document. `null` leaves it to `<EditorContent placeholder>`. */
  text: string | null;
  /**
   * Shown in the empty block under the caret, by block: return a string,
   * or `null` for none. The default labels headings and quotes; pass your
   * own for "Type / for commands" in paragraphs.
   */
  block: ((node: ElementNode, editor: TeiEditor) => string | null) | null;
  /** Only while the editor is editable. Default true. */
  onlyWhenEditable: boolean;
}

const ATTR = 'data-tei-placeholder';

export const defaultBlockPlaceholder = (node: ElementNode, editor: TeiEditor): string | null => {
  if ($isHeadingNode(node)) return editor.t(`block.heading${node.getTag().slice(1)}`);
  if ($isQuoteNode(node)) return editor.t('block.quote');
  if ($isListItemNode(node)) return editor.t('placeholder.list');
  return null;
};

/** The element under a collapsed caret, if it is empty. */
function $emptyBlockAtCaret(): ElementNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const node = selection.anchor.getNode();
  const block = $isElementNode(node) ? node : node.getParent();
  if (!block || block.isInline() || block.getTextContentSize() > 0) return null;
  if (
    !$isParagraphNode(block) &&
    !$isHeadingNode(block) &&
    !$isQuoteNode(block) &&
    !$isListItemNode(block)
  ) {
    return block.getChildrenSize() === 0 ? block : null;
  }
  return block;
}

/**
 * Placeholders: one for the empty document, and one for the empty block the
 * caret is in. Both are drawn by CSS from attributes, so they need nothing
 * from `style-src`, never enter the document, and cost no React renders.
 */
export const Placeholder = defineTeiExtension({
  name: '@teispace/teieditor/placeholder',
  config: {
    text: null,
    block: defaultBlockPlaceholder,
    onlyWhenEditable: true,
  } as PlaceholderOptions,
  messages: { 'placeholder.list': 'List', 'placeholder.empty': 'Write something…' },
  register: ({ editor, lexical, options }) => {
    let marked: HTMLElement | null = null;
    const clear = () => {
      marked?.removeAttribute(ATTR);
      marked = null;
    };
    const sync = (target: LexicalEditor) => {
      const root = target.getRootElement();
      if (root && options.text !== null)
        root.setAttribute('data-placeholder', editor.t(options.text));
      if (options.onlyWhenEditable && !target.isEditable()) return clear();
      const { element, text } = target.getEditorState().read(() => {
        const block = $emptyBlockAtCaret();
        const only = $getRoot().getChildrenSize() === 1;
        // In an empty document the document placeholder speaks for the first block.
        if (!block || !options.block || (only && $isParagraphNode(block))) {
          return { element: null, text: null };
        }
        return {
          element: target.getElementByKey(block.getKey()),
          text: options.block(block, editor),
        };
      });
      if (element === marked && text && element?.getAttribute(ATTR) === text) return;
      clear();
      if (element && text) {
        element.setAttribute(ATTR, text);
        marked = element;
      }
    };
    return mergeRegister(
      lexical.registerUpdateListener(() => sync(lexical)),
      lexical.registerEditableListener(() => sync(lexical)),
      lexical.registerRootListener(() => sync(lexical)),
      clear,
    );
  },
});
