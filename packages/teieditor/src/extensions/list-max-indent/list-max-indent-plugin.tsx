import { $getListDepth, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_CRITICAL, type ElementNode, INDENT_CONTENT_COMMAND } from 'lexical';
import { useEffect } from 'react';

function getElementNodesInSelection(
  selection: ReturnType<typeof import('lexical').$getSelection>,
): Set<ElementNode> {
  const nodesInSelection = (selection as any)?.getNodes?.() || [];
  const elementNodes = new Set<ElementNode>();
  for (const node of nodesInSelection) {
    const parent = node.getParent();
    if (parent && $isListItemNode(parent)) {
      elementNodes.add(parent);
    }
  }
  return elementNodes;
}

function isPermittedIndent(maxDepth: number, elementNodes: Set<ElementNode>): boolean {
  for (const node of elementNodes) {
    if ($isListNode(node.getParent()) && $getListDepth(node.getParent()!) >= maxDepth) {
      return false;
    }
  }
  return true;
}

/**
 * Prevents lists from being indented beyond a maximum depth.
 */
export function ListMaxIndentPlugin({ maxDepth }: { maxDepth: number }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        let block = false;
        editor.getEditorState().read(() => {
          const { $getSelection, $isRangeSelection } = require('lexical');
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const elements = getElementNodesInSelection(selection);
          if (!isPermittedIndent(maxDepth, elements)) {
            block = true;
          }
        });
        return block;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, maxDepth]);

  return null;
}
