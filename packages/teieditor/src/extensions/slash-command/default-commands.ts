import { $createCodeNode } from '@lexical/code';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';
import { INSERT_CALLOUT_COMMAND } from '../callout/index.js';
import { INSERT_EMBED_COMMAND } from '../embed/index.js';
import { INSERT_IMAGE_COMMAND } from '../image/image-plugin.js';
import { INSERT_TABLE_COMMAND } from '../table/index.js';
import { INSERT_TOGGLE_COMMAND } from '../toggle/index.js';
import type { SlashCommandItem } from './types.js';

/**
 * Default slash commands included with the StarterKit.
 * Users can extend, replace, or filter these.
 */
export const defaultSlashCommands: SlashCommandItem[] = [
  // Text
  {
    name: 'paragraph',
    label: 'Text',
    description: 'Plain text block',
    keywords: ['paragraph', 'text', 'plain', 'normal'],
    group: 'Basic',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createParagraphNode());
      });
    },
  },
  // Headings
  {
    name: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title', 'large'],
    group: 'Headings',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode('h1'));
      });
    },
  },
  {
    name: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle', 'medium'],
    group: 'Headings',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode('h2'));
      });
    },
  },
  {
    name: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading', 'small'],
    group: 'Headings',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode('h3'));
      });
    },
  },
  {
    name: 'heading4',
    label: 'Heading 4',
    description: 'Small heading',
    keywords: ['h4', 'heading'],
    group: 'Headings',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode('h4'));
      });
    },
  },
  {
    name: 'heading5',
    label: 'Heading 5',
    description: 'Tiny heading',
    keywords: ['h5', 'heading'],
    group: 'Headings',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode('h5'));
      });
    },
  },
  {
    name: 'heading6',
    label: 'Heading 6',
    description: 'Smallest heading',
    keywords: ['h6', 'heading'],
    group: 'Headings',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode('h6'));
      });
    },
  },
  // Lists
  {
    name: 'bulletList',
    label: 'Bullet List',
    description: 'Unordered list',
    keywords: ['ul', 'unordered', 'bullet', 'list'],
    group: 'Lists',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    },
  },
  {
    name: 'numberedList',
    label: 'Numbered List',
    description: 'Ordered list',
    keywords: ['ol', 'ordered', 'numbered', 'list'],
    group: 'Lists',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    },
  },
  {
    name: 'checklist',
    label: 'Checklist',
    description: 'Todo list with checkboxes',
    keywords: ['todo', 'checklist', 'checkbox', 'task'],
    group: 'Lists',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    },
  },
  // Blocks
  {
    name: 'quote',
    label: 'Quote',
    description: 'Block quote',
    keywords: ['quote', 'blockquote', 'citation'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createQuoteNode());
      });
    },
  },
  {
    name: 'codeBlock',
    label: 'Code Block',
    description: 'Code with syntax highlighting',
    keywords: ['code', 'pre', 'syntax', 'programming'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createCodeNode());
      });
    },
  },
  {
    name: 'divider',
    label: 'Divider',
    description: 'Horizontal rule separator',
    keywords: ['hr', 'divider', 'separator', 'line', 'horizontal'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
    },
  },
  {
    name: 'toggle',
    label: 'Collapsible',
    description: 'Collapsible content block',
    keywords: ['toggle', 'collapse', 'accordion', 'details', 'collapsible'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_TOGGLE_COMMAND, 'Toggle');
    },
  },
  // Rich content
  {
    name: 'image',
    label: 'Image',
    description: 'Upload or embed an image',
    keywords: ['image', 'photo', 'picture', 'upload'],
    group: 'Media',
    onSelect: (editor) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            src: reader.result as string,
            altText: file.name,
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
  {
    name: 'table',
    label: 'Table',
    description: 'Insert a data table',
    keywords: ['table', 'grid', 'spreadsheet', 'data'],
    group: 'Media',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: 3, columns: 3, includeHeaders: true });
    },
  },
  {
    name: 'embed',
    label: 'Embed',
    description: 'YouTube, Twitter, or any URL',
    keywords: ['embed', 'youtube', 'video', 'twitter', 'link', 'figma', 'iframe'],
    group: 'Media',
    onSelect: (editor) => {
      const url = typeof window !== 'undefined' ? window.prompt('Enter URL to embed:') : null;
      if (url) editor.dispatchCommand(INSERT_EMBED_COMMAND, url);
    },
  },
  // Callouts
  {
    name: 'calloutInfo',
    label: 'Info Callout',
    description: 'Info callout block',
    keywords: ['callout', 'alert', 'info', 'notice', 'note'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'info');
    },
  },
  {
    name: 'calloutWarning',
    label: 'Warning Callout',
    description: 'Warning callout block',
    keywords: ['warning', 'caution', 'alert', 'danger'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'warning');
    },
  },
  {
    name: 'calloutSuccess',
    label: 'Success Callout',
    description: 'Success callout block',
    keywords: ['success', 'tip', 'done', 'check'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'success');
    },
  },
  {
    name: 'calloutError',
    label: 'Error Callout',
    description: 'Error callout block',
    keywords: ['error', 'danger', 'fail', 'critical'],
    group: 'Blocks',
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'error');
    },
  },
];
