'use client';

import { getExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import {
  $getTableAtSelection,
  type CellVerticalAlign,
  Table,
} from '../../extensions/table/index.js';
import { groupItems, useItemStates } from '../items.js';
import type { MenuGroupData, MenuItemData } from '../ui/menu.js';
import { useEditorState } from '../use-editor-state.js';

function swatchIcon(color: string | null) {
  return (
    <span
      className="tei-menu-swatch"
      data-empty={color === null ? '' : undefined}
      ref={(el) => {
        if (el && color !== null) el.style.setProperty('--tei-swatch', color);
      }}
    />
  );
}

/** The menu's entries, from the `tableMenu` items: grouped by section, with submenus for the controls. */
export function useTableMenu(editor: TeiEditor, onDone: () => void): MenuGroupData[] {
  // Each render: which entries show can follow the options, live.
  const items = editor.items('tableMenu');
  const states = useItemStates(editor, items);
  const extra = useEditorState(
    (e) => ({
      background: e.read(() => {
        const at = $getTableAtSelection();
        const colors = new Set(at?.cells.map((cell) => cell.getBackgroundColor()));
        return colors.size === 1 ? ([...colors][0] ?? null) : undefined;
      }),
      align: (['top', 'middle', 'bottom'] as const).find((a) => e.isActive('cellVerticalAlign', a)),
    }),
    { editor },
  );
  const options = getExtensionOptions(editor, Table);
  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };

  const entry = (item: TeiItem, index: number): MenuItemData => {
    const state = states[index];
    const label = editor.t(item.label);
    if (item.control === 'cellBackground') {
      const none = editor.t('table.cellBackground.none');
      return {
        id: item.id,
        label,
        icon: item.icon,
        disabled: !state?.enabled,
        items: [
          { value: null, label: none },
          ...(options?.cellColors ?? []).map((c) => ({ value: c.value, label: c.label })),
        ].map((color) => ({
          id: `cellBackground-${color.label}`,
          label: color.label,
          icon: swatchIcon(color.value),
          checked: extra.background === color.value,
          radio: true,
          onSelect: run(() => editor.chain().focus().setCellBackground(color.value).run()),
        })),
      };
    }
    if (item.control === 'cellVerticalAlign') {
      return {
        id: item.id,
        label,
        icon: item.icon,
        disabled: !state?.enabled,
        items: (['top', 'middle', 'bottom'] as const satisfies readonly CellVerticalAlign[]).map(
          (align) => ({
            id: `verticalAlign-${align}`,
            label: editor.t(`table.verticalAlign.${align}`),
            icon: `align${align[0]?.toUpperCase()}${align.slice(1)}`,
            checked: extra.align === align,
            radio: true,
            onSelect: run(() => editor.chain().focus().setCellVerticalAlign(align).run()),
          }),
        ),
      };
    }
    return {
      id: item.id,
      label,
      icon: item.icon,
      checked: item.active ? Boolean(state?.active) : undefined,
      disabled: !state?.enabled,
      variant: item.variant,
      onSelect: run(() => {
        editor.runItem(item);
        editor.focus();
      }),
    };
  };

  return groupItems(items, entry);
}
