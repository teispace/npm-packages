import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type LexicalCommand,
  type LexicalNode,
  type SerializedLexicalNode,
} from 'lexical';
import type { JSX } from 'react';
import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void> = createCommand(
  'INSERT_HORIZONTAL_RULE_COMMAND',
);

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

export class HorizontalRuleNode extends DecoratorNode<JSX.Element> {
  static getType(): string {
    return 'horizontal-rule';
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  createDOM(): HTMLElement {
    const el = document.createElement('div');
    el.style.display = 'contents';
    return el;
  }

  updateDOM(): false {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: convertHorizontalRuleElement,
        priority: 0,
      }),
    };
  }

  exportDOM(): { element: HTMLElement } {
    return { element: document.createElement('hr') };
  }

  static importJSON(): HorizontalRuleNode {
    return $createHorizontalRuleNode();
  }

  exportJSON(): SerializedLexicalNode {
    return {
      type: 'horizontal-rule',
      version: 1,
    };
  }

  getTextContent(): string {
    return '\n';
  }

  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return <hr className="tei-hr my-4 border-t border-border" />;
  }
}

function convertHorizontalRuleElement(): DOMConversionOutput {
  return { node: $createHorizontalRuleNode() };
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return new HorizontalRuleNode();
}

export function $isHorizontalRuleNode(
  node: LexicalNode | null | undefined,
): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function HorizontalRulePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const focusNode = selection.focus.getNode();
        if (focusNode !== null) {
          const hrNode = $createHorizontalRuleNode();
          selection.insertNodes([hrNode]);

          // Insert a paragraph after the HR so the cursor has somewhere to go.
          const paragraphNode = $createParagraphNode();
          hrNode.insertAfter(paragraphNode);
          paragraphNode.select();
        }
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}
