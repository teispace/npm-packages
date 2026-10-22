'use client';

import type { TeiEditor } from '../core/editor.js';
import type { TeiItem } from '../core/types.js';
import type { MenuGroupData, MenuItemData } from './ui/menu.js';
import { useEditorState } from './use-editor-state.js';

/** What a UI item shows: lit up, and whether it can run now. */
export interface ItemState {
  active: boolean;
  enabled: boolean;
}

/** An item's state right now. Read-only editors enable nothing. */
export function readItemState(editor: TeiEditor, item: TeiItem): ItemState {
  // Item names are plain strings; the typed overloads are for app code.
  const loose = editor as unknown as {
    isActive(name: string, ...args: readonly unknown[]): boolean;
  };
  return {
    active: item.active ? loose.isActive(item.active, ...(item.activeArgs ?? [])) : false,
    enabled:
      editor.isEditable &&
      (item.command ? editor.can().command(item.command, ...(item.args ?? [])) : true),
  };
}

function sameStates(a: readonly ItemState[], b: readonly ItemState[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.active === b[i]?.active && s.enabled === b[i]?.enabled)
  );
}

/**
 * The state of many items from one subscription; the component re-renders
 * only when one of them changes.
 */
export function useItemStates(editor: TeiEditor, items: readonly TeiItem[]): ItemState[] {
  return useEditorState((e) => items.map((item) => readItemState(e, item)), {
    editor,
    equal: sameStates,
  });
}

/** An item's label, translated; its shortcut, formatted for this platform. */
export function itemText(
  editor: TeiEditor,
  item: TeiItem,
): { label: string; description?: string; shortcut?: string[] } {
  return {
    label: editor.t(item.label),
    description: item.description ? editor.t(item.description) : undefined,
    shortcut: item.shortcut ? editor.shortcut(item.shortcut) : undefined,
  };
}

/** Menu sections from items, by their `group`, in the order the groups first appear. */
export function groupItems(
  items: readonly TeiItem[],
  entry: (item: TeiItem, index: number) => MenuItemData,
): MenuGroupData[] {
  const groups: Array<{ id: string; items: MenuItemData[] }> = [];
  items.forEach((item, index) => {
    const id = item.group ?? 'other';
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = { id, items: [] };
      groups.push(group);
    }
    group.items.push(entry(item, index));
  });
  return groups;
}
