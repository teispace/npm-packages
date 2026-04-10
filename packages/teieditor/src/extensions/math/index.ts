import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { $createMathNode, MathNode } from './math-node.js';

export interface MathPayload {
  expression: string;
  inline?: boolean;
}

export const INSERT_MATH_COMMAND: LexicalCommand<MathPayload> =
  createCommand('INSERT_MATH_COMMAND');

class MathExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'math';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [MathNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_MATH_COMMAND,
      (payload) => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const node = $createMathNode(payload.expression, payload.inline ?? false);
          selection.insertNodes([node]);
          if (!payload.inline) {
            const paragraph = $createParagraphNode();
            node.insertAfter(paragraph);
            paragraph.select();
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Math = new MathExtension();
export { $createMathNode, $isMathNode, MathNode } from './math-node.js';
