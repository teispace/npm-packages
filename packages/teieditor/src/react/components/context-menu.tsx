'use client';

import {
  $createNodeSelection,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isDecoratorNode,
  $isNodeSelection,
  $setSelection,
} from 'lexical';
import { useEffect, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem, TeiPlacement } from '../../core/types.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { contextMenuOwners } from '../context-menu-owner.js';
import { groupItems, useItemStates } from '../items.js';
import { selectionAnchor } from '../selection-anchor.js';
import type { VirtualElement } from '../ui/floating.js';
import { Menu, type MenuGroupData, type MenuItemData } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';
import { useRootListener } from '../use-hover.js';
import { useBlockMenu } from './block-menu.js';

export interface ContextMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /**
   * Change the menu as it opens: add, drop, relabel or reorder its sections
   * (`clipboard`, `link`, `format`, the selected node's, `table`, then the
   * block's: `turnInto`, `block`, `delete`).
   */
  groups?: (groups: MenuGroupData[], editor: TeiEditor) => MenuGroupData[];
}

/** The toolbars of selected nodes and the table's menu: their actions come too, when they apply. */
const NODE_MENUS: readonly TeiPlacement[] = ['imageMenu', 'fileMenu', 'embedMenu'];

/** Items a menu can run as they are: a command or a function, no control of their own. */
const plain = (items: readonly TeiItem[]) =>
  items.filter((item) => (item.command || item.run) && !item.control);

/**
 * The editor's own menu on right-click (or the menu key, or Shift-F10):
 * cut, copy and paste, the link and formatting, what the selected image,
 * file or embed offers, the table's rows and columns, and the block's own
 * actions, each only where it applies. Shift-right-click keeps the
 * browser's menu; on a touch screen the phone's own stays.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function ContextMenu({ editor: editorProp, groups }: ContextMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <ContextMenu> needs an `editor` prop or a provider');
  return (
    <TeiEditorContext.Provider value={editor}>
      <EditorContextMenu editor={editor} edit={groups} />
    </TeiEditorContext.Provider>
  );
}

function EditorContextMenu({
  editor,
  edit,
}: {
  editor: TeiEditor;
  edit: ContextMenuProps['groups'];
}) {
  const editable = useEditorState((e) => e.isEditable, { editor });
  const [anchor, setAnchor] = useState<VirtualElement | null>(null);
  const close = () => setAnchor(null);

  useEffect(() => {
    contextMenuOwners.add(editor);
    return () => {
      contextMenuOwners.delete(editor);
    };
  }, [editor]);

  useRootListener(
    editor,
    'contextmenu',
    editable
      ? (event) => {
          if (event.shiftKey) return;
          if ((event as Partial<PointerEvent>).pointerType === 'touch') return;
          const root = editor.lexical.getRootElement();
          if (!root) return;
          event.preventDefault();
          selectNodeAt(editor, event.target);
          const box = root.getBoundingClientRect();
          const { clientX: x, clientY: y } = event;
          // From the keyboard, the event may come at 0,0 or outside: open at the caret.
          const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
          const at = inside && (x !== 0 || y !== 0) ? pointAnchor(root, x, y) : null;
          editor.focus();
          setAnchor(at ?? selectionAnchor(editor) ?? pointAnchor(root, box.left, box.top));
        }
      : null,
  );

  if (!anchor) return null;
  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      offset={2}
      restoreFocus={false}
      initialFocus="container"
      onDismiss={(reason) => {
        close();
        if (reason === 'escape') editor.focus();
      }}
      data-tei-control="context-menu"
    >
      <ContextMenuList editor={editor} edit={edit} onClose={close} />
    </Popover>
  );
}

/** Mounted only while open: its item states follow the selection without cost the rest of the time. */
function ContextMenuList({
  editor,
  edit,
  onClose,
}: {
  editor: TeiEditor;
  edit: ContextMenuProps['groups'];
  onClose: () => void;
}) {
  const own = useMenuEntries(editor, editor.items('contextMenu'), onClose, (group) =>
    // Greyed when they cannot run, as everywhere; the rest show only where they apply.
    group === 'clipboard' ? 'disable' : 'hide',
  );
  const nodes = useMenuEntries(
    editor,
    NODE_MENUS.flatMap((menu) => plain(editor.items(menu))),
    onClose,
    () => 'hide',
  );
  const table = useMenuEntries(editor, plain(editor.items('tableMenu')), onClose, () => 'hide');
  const block = useBlockMenu(editor, onClose);

  // The clipboard first, wherever its extension came in the list.
  const sections: MenuGroupData[] = [
    ...own.filter((group) => group.id === 'clipboard'),
    ...own.filter((group) => group.id !== 'clipboard'),
    ...nodes,
  ];
  if (table.length > 0) {
    sections.push({
      id: 'table',
      items: [{ id: 'table', label: editor.t('table.menu'), icon: 'table', groups: table }],
    });
  }
  sections.push(...block);
  const shown = edit ? edit(sections, editor) : sections;
  return <Menu groups={shown} label={editor.t('contextMenu.label')} onClose={onClose} />;
}

/** Menu sections from items; per group, what to do with an item that cannot run here. */
function useMenuEntries(
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

/** A point in the document that moves with it as it scrolls. */
function pointAnchor(root: HTMLElement, x: number, y: number): VirtualElement {
  const start = root.getBoundingClientRect();
  const dx = x - start.left;
  const dy = y - start.top;
  return {
    contextElement: root,
    getBoundingClientRect() {
      const box = root.getBoundingClientRect();
      return DOMRect.fromRect({ x: box.left + dx, y: box.top + dy, width: 0, height: 0 });
    },
  };
}

/** A right-click on an image, file or embed selects it first, as a click does. */
function selectNodeAt(editor: TeiEditor, target: EventTarget | null) {
  if (!(target instanceof Element) || !target.closest('[data-lexical-decorator]')) return;
  editor.update(() => {
    const node = $getNearestNodeFromDOMNode(target);
    if (!$isDecoratorNode(node)) return;
    const current = $getSelection();
    if ($isNodeSelection(current) && current.has(node.getKey())) return;
    const selection = $createNodeSelection();
    selection.add(node.getKey());
    $setSelection(selection);
  });
}
