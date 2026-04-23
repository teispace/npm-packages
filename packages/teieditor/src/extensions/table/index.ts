import { TablePlugin as LexicalTablePlugin } from '@lexical/react/LexicalTablePlugin';
import {
  $createTableNodeWithDimensions,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $createParagraphNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import { $getOrCreateRangeSelection } from '../../core/insert.js';
import type { ExtensionConfig } from '../../core/types.js';
import { TableActionPlugin } from './table-action-plugin.js';

export interface TableConfig extends ExtensionConfig {
  /** Default rows for new tables. */
  defaultRows: number;
  /** Default columns for new tables. */
  defaultColumns: number;
}

export interface InsertTablePayload {
  rows: number;
  columns: number;
  includeHeaders?: boolean;
}

export const INSERT_TABLE_COMMAND: LexicalCommand<InsertTablePayload> =
  createCommand('INSERT_TABLE_COMMAND');

class TableExtension extends BaseExtension<TableConfig> {
  readonly name = 'table';
  protected readonly defaults: TableConfig = {
    defaultRows: 3,
    defaultColumns: 3,
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [TableNode, TableRowNode, TableCellNode];
  }

  getPlugins(): Array<ComponentType> {
    return [LexicalTablePlugin, TableActionPlugin];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_TABLE_COMMAND,
      (payload) => {
        editor.update(() => {
          const selection = $getOrCreateRangeSelection();
          if (!selection) return;

          const tableNode = $createTableNodeWithDimensions(
            payload.rows,
            payload.columns,
            payload.includeHeaders ?? true,
          );
          selection.insertNodes([tableNode]);

          const paragraph = $createParagraphNode();
          tableNode.insertAfter(paragraph);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Table = new TableExtension();
