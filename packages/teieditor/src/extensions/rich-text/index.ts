import { ClickAfterLastBlockExtension, configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import { RichTextExtension } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
  $createParagraphNode,
  $createRangeSelectionFromDom,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  getDOMSelection,
  type LexicalEditor,
} from 'lexical';
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
 * A click into text while a node is selected (an image, an equation)
 * puts the caret where it landed. Lexical leaves that to the
 * `selectionchange` the mousedown fires, but the event comes late: when
 * the click follows at once (a trackpad tap), rich text's click handler
 * finds the node still selected, clears it, and the caret the browser
 * placed goes too. The DOM selection is already right; take it.
 */
function registerClickIntoText(lexical: LexicalEditor): () => void {
  return lexical.registerCommand(
    CLICK_COMMAND,
    (event) => {
      const selection = $getSelection();
      const target = event.target;
      if (!$isNodeSelection(selection) || !(target instanceof Element)) return false;
      // Text the document edits, not a node's own UI.
      if (target.closest('[contenteditable]')?.getAttribute('contenteditable') !== 'true')
        return false;
      const root = lexical.getRootElement();
      const dom = getDOMSelection(root?.ownerDocument.defaultView ?? null);
      if (!root || !dom?.anchorNode || !root.contains(dom.anchorNode)) return false;
      for (const node of selection.getNodes()) {
        if (lexical.getElementByKey(node.getKey())?.contains(target)) return false;
      }
      const caret = $createRangeSelectionFromDom(dom, lexical);
      if (!caret) return false;
      $setSelection(caret);
      return true;
    },
    // After a host's own click (high), before rich text's (editor).
    COMMAND_PRIORITY_LOW,
  );
}

/**
 * Rich text: paragraphs, Lexical's editing behaviour (Enter, Backspace,
 * selection, drag and drop, formatting keys), the HTML format and the paste
 * pipeline. Every rich-text feature depends on it.
 */
export const RichText = defineTeiExtension({
  name: '@teispace/teieditor/rich-text',
  dependencies: [
    RichTextExtension,
    // A click below a last block the caret can't leave (a table, an image, a
    // section) adds a line there to type on.
    ClickAfterLastBlockExtension,
    Html,
    configExtension(DOMImportExtension, { rules: [TEXT_BLOCKS_RULE] }),
  ],
  register: ({ lexical }) => registerClickIntoText(lexical),
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
