import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import {
  $createCollapsibleContainerNode,
  $createCollapsibleContentNode,
  $createCollapsibleTitleNode,
  CollapsibleContainerNode,
  CollapsibleContentNode,
  CollapsibleTitleNode,
} from './collapsible-nodes.js';
// Keep the old ToggleNode for backward compatibility during migration
import { ToggleNode } from './toggle-node.js';
import { TogglePlugin } from './toggle-plugin.js';

export const INSERT_TOGGLE_COMMAND: LexicalCommand<string> = createCommand('INSERT_TOGGLE_COMMAND');

class ToggleExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'toggle';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [
      CollapsibleContainerNode,
      CollapsibleTitleNode,
      CollapsibleContentNode,
      // Keep old node for migration/backward compat
      ToggleNode,
    ];
  }

  getPlugins(): Array<ComponentType> {
    return [TogglePlugin];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_TOGGLE_COMMAND,
      (title) => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          // Create the 3-node collapsible structure
          const container = $createCollapsibleContainerNode(true); // Start open
          const titleNode = $createCollapsibleTitleNode();
          const contentNode = $createCollapsibleContentNode();

          titleNode.append($createTextNode(title || 'Toggle'));
          contentNode.append($createParagraphNode());
          container.append(titleNode);
          container.append(contentNode);

          selection.insertNodes([container]);

          // Focus the content area
          const paragraph = contentNode.getFirstChild();
          if (paragraph && 'select' in paragraph) {
            (paragraph as any).select();
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Toggle = new ToggleExtension();

// Export new 3-node collapsible API
export {
  $createCollapsibleContainerNode,
  $createCollapsibleContentNode,
  $createCollapsibleTitleNode,
  $isCollapsibleContainerNode,
  $isCollapsibleContentNode,
  $isCollapsibleTitleNode,
  CollapsibleContainerNode,
  CollapsibleContentNode,
  CollapsibleTitleNode,
} from './collapsible-nodes.js';

// Keep legacy exports for backward compat
export { $createToggleNode, $isToggleNode, ToggleNode } from './toggle-node.js';
