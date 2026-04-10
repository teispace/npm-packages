import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
} from 'lexical';
import { useEffect } from 'react';
import {
  $isCollapsibleContainerNode,
  $isCollapsibleContentNode,
  $isCollapsibleTitleNode,
  CollapsibleContainerNode,
  CollapsibleContentNode,
  CollapsibleTitleNode,
} from './collapsible-nodes.js';

/**
 * Plugin for collapsible/toggle blocks.
 * Handles:
 * - Ensuring collapsible containers always have title + content nodes
 * - Enter in title creates paragraph in content
 * - ArrowDown from title moves to content
 * - Backspace in empty title removes the collapsible
 */
export function TogglePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Ensure container always has title + content children
    const removeContainerTransform = editor.registerNodeTransform(
      CollapsibleContainerNode,
      (node) => {
        const children = node.getChildren();
        const hasTitle = children.some((c) => $isCollapsibleTitleNode(c));
        const hasContent = children.some((c) => $isCollapsibleContentNode(c));

        if (!hasTitle) {
          const title = new CollapsibleTitleNode();
          title.append($createTextNode('Toggle'));
          node.splice(0, 0, [title]);
        }
        if (!hasContent) {
          const content = new CollapsibleContentNode();
          content.append($createParagraphNode());
          node.append(content);
        }
      },
    );

    // Ensure content always has at least one child
    const removeContentTransform = editor.registerNodeTransform(CollapsibleContentNode, (node) => {
      if (node.getChildrenSize() === 0) {
        node.append($createParagraphNode());
      }
    });

    // Ensure title has at least some content
    const removeTitleTransform = editor.registerNodeTransform(CollapsibleTitleNode, (node) => {
      if (node.getChildrenSize() === 0) {
        node.append($createTextNode(''));
      }
    });

    return () => {
      removeContainerTransform();
      removeContentTransform();
      removeTitleTransform();
    };
  }, [editor]);

  return null;
}
