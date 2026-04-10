import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
} from '@lexical/table';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Table action commands (used by toolbar / context menu)
// ---------------------------------------------------------------------------

export const INSERT_TABLE_ROW_COMMAND: LexicalCommand<{ after: boolean }> =
  createCommand('INSERT_TABLE_ROW');
export const INSERT_TABLE_COLUMN_COMMAND: LexicalCommand<{ after: boolean }> =
  createCommand('INSERT_TABLE_COLUMN');
export const DELETE_TABLE_ROW_COMMAND: LexicalCommand<void> = createCommand('DELETE_TABLE_ROW');
export const DELETE_TABLE_COLUMN_COMMAND: LexicalCommand<void> =
  createCommand('DELETE_TABLE_COLUMN');
export const DELETE_TABLE_COMMAND: LexicalCommand<void> = createCommand('DELETE_TABLE');

/**
 * Registers table manipulation commands (insert/delete rows/columns/table).
 * These can be dispatched from toolbar buttons or a context menu.
 */
export function TableActionPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unsubs = [
      editor.registerCommand(
        INSERT_TABLE_ROW_COMMAND,
        ({ after }) => {
          editor.update(() => {
            $insertTableRow__EXPERIMENTAL(after);
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_TABLE_COLUMN_COMMAND,
        ({ after }) => {
          editor.update(() => {
            $insertTableColumn__EXPERIMENTAL(after);
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DELETE_TABLE_ROW_COMMAND,
        () => {
          editor.update(() => {
            $deleteTableRow__EXPERIMENTAL();
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DELETE_TABLE_COLUMN_COMMAND,
        () => {
          editor.update(() => {
            $deleteTableColumn__EXPERIMENTAL();
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DELETE_TABLE_COMMAND,
        () => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            const cell = $getTableCellNodeFromLexicalNode(selection.anchor.getNode());
            if (!cell) return;
            const table = $getTableNodeFromLexicalNodeOrThrow(cell);
            table.remove();
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [editor]);

  return null;
}
