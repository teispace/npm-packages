import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $isElementNode,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
} from 'lexical';
import { useEffect } from 'react';
import { $isToggleNode, ToggleNode } from './toggle-node.js';

/**
 * Keyboard handling for toggle/collapsible blocks.
 * - Enter at end of toggle: insert paragraph after
 * - ArrowDown at last position: move to next sibling
 */
export function TogglePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Ensure toggle nodes always have at least one child
    const removeTransform = editor.registerNodeTransform(ToggleNode, (node) => {
      if (node.getChildrenSize() === 0) {
        const p = $createParagraphNode();
        node.append(p);
      }
    });

    // Arrow down from last child exits the toggle
    const removeArrow = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        // Let default behavior handle most cases
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removeTransform();
      removeArrow();
    };
  }, [editor]);

  return null;
}
