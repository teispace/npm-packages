'use client';

import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { groupItems, useItemStates } from '../items.js';
import type { MenuGroupData, MenuItemData } from '../ui/menu.js';

/** Menu sections from items; per group, what to do with an item that cannot run here. */
export function useMenuEntries(
  editor: TeiEditor,
  items: readonly TeiItem[],
  onDone: () => void,
  unavailable: (group: string) => 'hide' | 'disable',
): MenuGroupData[] {
  const states = useItemStates(editor, items);
  return groupItems(items, (item, index): MenuItemData => {
    const state = states[index];
    return {
      id: item.id,
      label: editor.t(item.label),
      icon: item.icon,
      shortcut: item.shortcut ? editor.shortcut(item.shortcut) : undefined,
      // A choice among several (an alignment) shows which is on; an action does not.
      checked: item.active && item.args?.length ? Boolean(state?.active) : undefined,
      radio: item.active && item.args?.length ? true : undefined,
      disabled: !state?.enabled,
      variant: item.variant,
      onSelect: () => {
        onDone();
        editor.focus();
        editor.runItem(item);
      },
    };
  })
    .map((group) => ({
      ...group,
      items: group.items.filter((entry) => !entry.disabled || unavailable(group.id) === 'disable'),
    }))
    .filter((group) => group.items.length > 0 && group.items.some((entry) => !entry.disabled));
}
