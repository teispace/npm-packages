import { QUOTE } from '@lexical/markdown';
import { $createQuoteNode, $isQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isRangeSelection, type ElementNode } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { quote } from '../../icons/index.js';
import { $everyBlock } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setBlockquote: [];
    toggleBlockquote: [];
  }
  interface TeiActiveStates {
    blockquote: [];
  }
}

const $isQuote = () => $everyBlock($isQuoteNode);

/** Block quotes. Markdown `> `, ⌃⇧Q (Lexical's key) or ⌘⇧B (Tiptap's). */
export const Blockquote = defineTeiExtension({
  name: '@teispace/teieditor/blockquote',
  dependencies: [RichText],
  commands: {
    setBlockquote: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        $setBlocksType(selection, $createQuoteNode);
      },
      can: () => $isRangeSelection($getSelection()),
    },
    toggleBlockquote: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        const quoted = $isQuote();
        $setBlocksType(
          selection,
          (): ElementNode => (quoted ? $createParagraphNode() : $createQuoteNode()),
        );
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: { blockquote: $isQuote },
  keymap: {
    blockquote: {
      key: ['Ctrl-Shift-q', 'Mod-Shift-b'],
      command: 'toggleBlockquote',
      description: 'Quote',
    },
  },
  markdown: { quote: QUOTE },
  icons: { quote },
  messages: { 'block.quote': 'Quote', 'block.quote.description': 'Capture a quotation' },
  items: [
    {
      id: 'blockquote',
      label: 'block.quote',
      description: 'block.quote.description',
      icon: 'quote',
      in: ['blockType', 'slash', 'blockMenu'],
      group: 'basic',
      order: 20,
      keywords: ['quote', 'blockquote', 'citation', '>'],
      shortcut: 'blockquote',
      command: 'setBlockquote',
      active: 'blockquote',
    },
  ],
});
