import { RichTextExtension } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isParagraphNode, $isRangeSelection } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { paragraph } from '../../icons/index.js';
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
 * Rich text: paragraphs, Lexical's editing behaviour (Enter, Backspace,
 * selection, drag and drop, formatting keys), the HTML format and the paste
 * pipeline. Every rich-text feature depends on it.
 */
export const RichText = defineTeiExtension({
  name: '@teispace/teieditor/rich-text',
  dependencies: [RichTextExtension, Html],
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
