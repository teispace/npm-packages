import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleExtension,
  HorizontalRuleNode,
} from '@lexical/extension';
import type { ElementTransformer } from '@lexical/markdown';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $getSelection, $isRangeSelection } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { horizontalRule } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    insertHorizontalRule: [];
  }
}

/** `---`, `***` or `___` on a line of its own. */
export const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? '***' : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parent, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode();
    if (isImport || parent.getNextSibling() !== null) parent.replace(rule);
    else parent.insertBefore(rule);
    rule.selectNext();
  },
  type: 'element',
};

/** A divider between sections. Markdown `---`. */
export const HorizontalRule = defineTeiExtension({
  name: '@teispace/teieditor/horizontal-rule',
  dependencies: [RichText, HorizontalRuleExtension],
  commands: {
    insertHorizontalRule: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        $insertNodeToNearestRoot($createHorizontalRuleNode());
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  markdown: { horizontalRule: HORIZONTAL_RULE },
  icons: { horizontalRule },
  messages: { 'block.divider': 'Divider', 'block.divider.description': 'Separate sections' },
  items: [
    {
      id: 'horizontalRule',
      label: 'block.divider',
      description: 'block.divider.description',
      icon: 'horizontalRule',
      in: ['slash', 'insert'],
      group: 'basic',
      order: 40,
      keywords: ['hr', 'divider', 'separator', 'line', 'rule', '---'],
      command: 'insertHorizontalRule',
    },
  ],
});
