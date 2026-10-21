import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import { RichTextExtension } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isParagraphNode, $isRangeSelection } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { paragraph } from '../../icons/index.js';
import { $flattenImported } from '../../utils/flatten-blocks.js';
import { $everyBlock } from '../../utils/selection.js';
import { Html } from '../html/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setParagraph: [];
  }
  interface TeiActiveStates {
    paragraph: [];
  }
}

/**
 * Quotes and headings hold text, not blocks: the paragraphs in pasted
 * `<blockquote><p>a</p><p>b</p></blockquote>` become lines of the quote.
 */
const TEXT_BLOCKS_RULE = defineImportRule({
  name: '@teispace/teieditor/rich-text/text-blocks',
  match: sel.tag('blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'),
  $import: (_ctx, _el, $next) => $flattenImported($next()),
});

/**
 * Rich text: paragraphs, Lexical's editing behaviour (Enter, Backspace,
 * selection, drag and drop, formatting keys), the HTML format and the paste
 * pipeline. Every rich-text feature depends on it.
 */
export const RichText = defineTeiExtension({
  name: '@teispace/teieditor/rich-text',
  dependencies: [
    RichTextExtension,
    Html,
    configExtension(DOMImportExtension, { rules: [TEXT_BLOCKS_RULE] }),
  ],
  commands: {
    setParagraph: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        $setBlocksType(selection, $createParagraphNode);
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: {
    paragraph: () => $everyBlock($isParagraphNode),
  },
  keymap: {
    paragraph: { key: 'Mod-Alt-0', command: 'setParagraph', description: 'Text' },
  },
  icons: { paragraph },
  messages: {
    'block.paragraph': 'Text',
    'block.paragraph.description': 'Plain paragraph text',
  },
  items: [
    {
      id: 'paragraph',
      label: 'block.paragraph',
      description: 'block.paragraph.description',
      icon: 'paragraph',
      in: ['blockType', 'slash', 'blockMenu'],
      group: 'basic',
      order: 0,
      keywords: ['text', 'paragraph', 'p', 'normal', 'plain'],
      shortcut: 'paragraph',
      command: 'setParagraph',
      active: 'paragraph',
    },
  ],
});
