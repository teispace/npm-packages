'use client';

import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { groupItems, useItemStates } from '../items.js';
import type { MenuGroupData, MenuItemData } from '../ui/menu.js';

/** Its entries: "Turn into" the block types, then the `blockMenu` actions by group. */
export function useBlockMenu(editor: TeiEditor, onDone: () => void): MenuGroupData[] {
  const items = editor.items('blockMenu');
  const states = useItemStates(editor, items);
  const run = (item: TeiItem) => () => {
    onDone();
    editor.runItem(item);
  };
  const entry = (item: TeiItem, index: number): MenuItemData => {
    const state = states[index];
    const shortcut = item.shortcut ? editor.shortcut(item.shortcut) : undefined;
    return {
      id: item.id,
      label: editor.t(item.label),
      icon: item.icon,
      shortcut,
      checked: item.active ? Boolean(state?.active) : undefined,
      radio: item.active ? true : undefined,
      disabled: !state?.enabled,
      variant: item.variant,
      onSelect: run(item),
    };
  };
  const types = items.flatMap((item, index) =>
    item.in.includes('blockType') ? [entry(item, index)] : [],
  );
  const groups = groupItems(
    items.filter((item) => !item.in.includes('blockType')),
    (item) => entry(item, items.indexOf(item)),
  );
  if (types.some((type) => !type.disabled)) {
    groups.unshift({
      id: 'turnInto',
      items: [
        {
          id: 'turnInto',
          label: editor.t('block.turnInto'),
          // What the block is now.
          icon: types.find((type) => type.checked)?.icon ?? 'paragraph',
          items: types,
        },
      ],
    });
  }
  return groups;
}
