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
import { $createToggleNode, ToggleNode } from './toggle-node.js';

export const INSERT_TOGGLE_COMMAND: LexicalCommand<string> = createCommand('INSERT_TOGGLE_COMMAND');

class ToggleExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'toggle';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [ToggleNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_TOGGLE_COMMAND,
      (title) => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const toggle = $createToggleNode(title || 'Toggle');
          selection.insertNodes([toggle]);
          toggle.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Toggle = new ToggleExtension();
export { $createToggleNode, $isToggleNode, ToggleNode } from './toggle-node.js';
