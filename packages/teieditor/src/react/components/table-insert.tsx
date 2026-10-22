'use client';

import { getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import type { TableOptions } from '../../extensions/table/index.js';
import { GridPicker } from '../ui/controls.js';
import { DropdownMenu } from '../ui/dropdown.js';
import { useEditorState } from '../use-editor-state.js';
import type { ToolbarSubmenu } from './editor-toolbar.js';

const SIZES: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
];

/** A toolbar button that opens a grid: hover or arrow to a size, click or Enter to insert. */
export function InsertTableMenu({ editor }: { editor: TeiEditor }) {
  const enabled = useEditorState((e) => e.can().insertTable(), { editor });
  const options = getPeerOptions<TableOptions>(editor.lexical, '@teispace/teieditor/table');
  if (!options) return null;
  const label = editor.t('table.insert');
  return (
    <DropdownMenu
      data-item="insertTable"
      data-tei-control="insertTable"
      icon="table"
      label={label}
      aria-label={label}
      menuLabel={label}
      disabled={!enabled}
      content={(close) => (
        <GridPicker
          rows={Math.min(8, options.maxRows)}
          columns={Math.min(10, options.maxColumns)}
          formatCaption={(rows, columns) => `${rows} × ${columns}`}
          onPick={(rows, columns) => {
            close();
            editor.chain().focus().insertTable(rows, columns).run();
          }}
        />
      )}
    />
  );
}

InsertTableMenu.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => ({
  label: editor.t('table.insert'),
  icon: 'table',
  items: SIZES.map(
    ([rows, columns]): TeiItem => ({
      id: `insertTable-${rows}x${columns}`,
      label: `${rows} × ${columns}`,
      in: [],
      command: 'insertTable',
      args: [rows, columns],
    }),
  ),
});
