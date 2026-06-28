'use client';

import { $getListDepth, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  type BaseSelection,
  COMMAND_PRIORITY_CRITICAL,
  type ElementNode,
  INDENT_CONTENT_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

function getElementNodesInSelection(selection: BaseSelection): Set<ElementNode> {
  const elementNodes = new Set<ElementNode>();
  for (const node of selection.getNodes()) {
    const parent = node.getParent();
    if (parent && $isListItemNode(parent)) {
      elementNodes.add(parent);
    }
  }
  return elementNodes;
}

function isPermittedIndent(maxDepth: number, elementNodes: Set<ElementNode>): boolean {
  for (const node of elementNodes) {
    // Bind the parent once so the `$isListNode` type guard narrows it to
    // `ListNode` — `$getListDepth` requires a `ListNode` as of @lexical/list
    // 0.46. Calling `getParent()` twice would defeat the narrowing.
    const parent = node.getParent();
    if ($isListNode(parent) && $getListDepth(parent) >= maxDepth) {
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
