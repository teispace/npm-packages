import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { $createCalloutNode, CalloutNode, type CalloutVariant } from './callout-node.js';

export const INSERT_CALLOUT_COMMAND: LexicalCommand<CalloutVariant> =
  createCommand('INSERT_CALLOUT_COMMAND');

class CalloutExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'callout';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [CalloutNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_CALLOUT_COMMAND,
      (variant) => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const callout = $createCalloutNode(variant);
          selection.insertNodes([callout]);
          callout.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Callout = new CalloutExtension();
export {
  $createCalloutNode,
  $isCalloutNode,
  CalloutNode,
  type CalloutVariant,
} from './callout-node.js';
