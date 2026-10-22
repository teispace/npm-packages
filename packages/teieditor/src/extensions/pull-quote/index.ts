import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import { QuoteNode, type SerializedQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
  $create,
  $createParagraphNode,
  $getDocument,
  $getSelection,
  $isRangeSelection,
  type DOMExportOutput,
  type EditorConfig,
  type ElementNode,
  isHTMLElement,
  type LexicalEditor,
  type LexicalNode,
  type SerializedPartial,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { pullQuote } from '../../icons/index.js';
import { $flattenBlocks } from '../../utils/flatten-blocks.js';
import { $everyBlock } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setPullQuote: [];
    togglePullQuote: [];
  }
  interface TeiActiveStates {
    pullQuote: [];
  }
}

/**
 * A line lifted from the text and set large, to draw the eye: a quote of
 * the document itself, not of a source. An `<aside>`, as HTML has it, so
 * readers that skip asides do not read it twice. Markdown has no such
 * thing: it is saved there as a plain quote.
 */
export class PullQuoteNode extends QuoteNode {
  $config() {
    return this.config('pull-quote', { extends: QuoteNode });
  }

  // QuoteNode's own makes a QuoteNode.
  static importJSON(json: SerializedPartial<SerializedQuoteNode>): PullQuoteNode {
    return $createPullQuoteNode().updateFromJSON(json);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement('aside');
    element.className = (config.theme.pullQuote as string | undefined) ?? 'tei-pull-quote';
    element.setAttribute('data-tei-pull-quote', '');
    return element;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    // The editor's class is for the editor; saved HTML has the attribute.
    if (isHTMLElement(element)) element.removeAttribute('class');
    return { element };
  }
}

export function $createPullQuoteNode(): PullQuoteNode {
  return $create(PullQuoteNode);
}

export function $isPullQuoteNode(node: LexicalNode | null | undefined): node is PullQuoteNode {
  return node instanceof PullQuoteNode;
}

/** `<aside data-tei-pull-quote>`, and the `pullquote` class the web's styles use on an aside or a quote. */
const PULL_QUOTE_RULE = defineImportRule({
  name: '@teispace/teieditor/pull-quote',
  match: sel.tag('aside', 'blockquote'),
  $import: (ctx, el, $next) => {
    const pull =
      el.hasAttribute('data-tei-pull-quote') ||
      el.classList.contains('pullquote') ||
      el.classList.contains('pull-quote');
    if (!pull) return $next();
    const node = $createPullQuoteNode();
    return [node.splice(0, 0, $flattenBlocks(ctx.$importChildren(el)))];
  },
});

const $isPull = () => $everyBlock($isPullQuoteNode);

/** Pull quotes: in the block type menu, the slash menu and the block handle's. */
export const PullQuote = defineTeiExtension({
  name: '@teispace/teieditor/pull-quote',
  nodes: [PullQuoteNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [PULL_QUOTE_RULE] })],
  commands: {
    setPullQuote: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        $setBlocksType(selection, $createPullQuoteNode);
      },
      can: () => $isRangeSelection($getSelection()),
    },
    togglePullQuote: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        const pulled = $isPull();
        $setBlocksType(
          selection,
          (): ElementNode => (pulled ? $createParagraphNode() : $createPullQuoteNode()),
        );
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: { pullQuote: $isPull },
  icons: { pullQuote },
  messages: {
    'block.pullQuote': 'Pull quote',
    'block.pullQuote.description': 'Set a line large, to draw the eye',
  },
  items: [
    {
      id: 'pullQuote',
      label: 'block.pullQuote',
      description: 'block.pullQuote.description',
      icon: 'pullQuote',
      in: ['blockType', 'slash', 'blockMenu'],
      group: 'basic',
      order: 21,
      keywords: ['pull', 'quote', 'aside', 'highlight', 'emphasis'],
      command: 'setPullQuote',
      active: 'pullQuote',
    },
  ],
});
