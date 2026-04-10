import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface ListConfig extends ExtensionConfig {
  /** Enable checklist support. Default: true. */
  checklist: boolean;
  /** Max indent level. Default: 7. */
  maxDepth: number;
}

class ListExtension extends BaseExtension<ListConfig> {
  readonly name = 'list';
  protected readonly defaults: ListConfig = {
    checklist: true,
    maxDepth: 7,
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [ListNode, ListItemNode];
  }

  getPlugins(): Array<ComponentType> {
    const plugins: ComponentType[] = [ListPlugin];
    if (this.config.checklist) {
      plugins.push(CheckListPlugin);
    }
    return plugins;
  }

  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    return {
      'Mod+Shift+7': (editor) => {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        return true;
      },
      'Mod+Shift+8': (editor) => {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        return true;
      },
      'Mod+Shift+9': (editor) => {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        return true;
      },
    };
  }
}

export const List = new ListExtension();

// Re-export commands for use in toolbar/UI components
export {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
