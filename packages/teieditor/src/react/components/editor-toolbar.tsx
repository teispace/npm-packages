'use client';

import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { type ItemState, itemText, useItemStates } from '../items.js';
import { Button } from '../ui/button.js';
import type { TeiIconLike } from '../ui/context.js';
import { DropdownMenu } from '../ui/dropdown.js';
import type { MenuGroupData, MenuItemData } from '../ui/menu.js';
import { Separator, Toolbar, type ToolbarProps } from '../ui/toolbar.js';
import { fitToolbar, type ToolbarSlot, visibleSlots } from './toolbar-fit.js';

/**
 * One toolbar entry: an item id (`'bold'`), a control id (`'blockType'`,
 * `'align'`, or one of `controls`), or any element. Falsy entries are skipped,
 * so `cond && 'link'` works.
 */
export type ToolbarEntry = string | ReactNode;

/** Groups of entries; a separator goes between groups. */
export type ToolbarLayout = readonly (readonly ToolbarEntry[])[];

/** How a control shows in the "More" menu: a submenu of items, one of them current. */
export interface ToolbarSubmenu {
  label: string;
  icon?: string | TeiIconLike;
  items: readonly TeiItem[];
}

/**
 * A control the layout can name: it renders itself from the editor. Give it
 * `overflowMenu` and it moves into the "More" menu, as a submenu, when the
 * toolbar runs out of room; without, it always stays in the toolbar.
 */
export type ToolbarControl = ComponentType<{ editor: TeiEditor }> & {
  overflowMenu?: (editor: TeiEditor) => ToolbarSubmenu;
};

export interface EditorToolbarProps extends Omit<ToolbarProps, 'children' | 'overflow'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /**
   * What goes where. Default: every toolbar item the installed extensions
   * contribute, by group, with a block-type menu after undo/redo and the
   * alignments in one menu.
   */
  layout?: ToolbarLayout;
  /** Controls by id, for `layout`; the same ids replace the built-in `blockType` and `align`. */
  controls?: Record<string, ToolbarControl>;
  /**
   * When the entries don't fit on one line: `menu` moves the last ones into
   * a "More" menu (the default), `wrap` puts them on more lines, `scroll`
   * scrolls sideways. Elements in the layout always stay in the toolbar.
   */
  overflow?: 'menu' | 'wrap' | 'scroll';
}

/** An entry that can move into the "More" menu. */
type Movable = { item: TeiItem } | { submenu: ToolbarSubmenu };

interface Entry {
  key: string;
  render: (state?: ItemState) => ReactNode;
  item?: TeiItem;
  movable?: Movable;
}

/**
 * The formatting toolbar, built from what the extensions contribute: add
 * `Table` and its button appears, with no wiring. Rearrange it with
 * `layout`, add your own with `controls`, or hide an item for every UI with
 * the editor's `items: { bold: null }`. What doesn't fit moves into a
 * "More" menu at the end.
 */
export function EditorToolbar({
  editor: editorProp,
  layout,
  controls,
  overflow = 'menu',
  ...rest
}: EditorToolbarProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) {
    throw new Error('teieditor: <EditorToolbar> needs an `editor` prop or a provider');
  }
  const all = useMemo(() => editor.items('toolbar'), [editor]);
  const groups = useMemo(() => layout ?? defaultLayout(editor, all), [layout, editor, all]);
  const named = useMemo(() => ({ ...BUILT_IN_CONTROLS, ...controls }), [controls]);

  // The entries, by group, with what each becomes in the "More" menu.
  const entries = useMemo(() => {
    const byId = new Map(all.map((item) => [item.id, item]));
    return groups
      .map((group, g) =>
        group.flatMap((entry, i): Entry[] => {
          if (entry === null || entry === undefined || entry === false || entry === '') return [];
          if (typeof entry !== 'string') return [{ key: `${g}:node-${i}`, render: () => entry }];
          const Control = named[entry];
          if (Control) {
            const submenu = Control.overflowMenu?.(editor);
            return [
              {
                key: `${g}:${entry}`,
                render: () => <Control editor={editor} />,
                movable: submenu ? { submenu } : undefined,
              },
            ];
          }
          const item = byId.get(entry);
          if (!item) return [];
          return [
            {
              key: `${g}:${entry}`,
              item,
              movable: { item },
              render: (state) => <ItemButton editor={editor} item={item} state={state} />,
            },
          ];
        }),
      )
      .filter((group) => group.length > 0);
  }, [groups, named, all, editor]);

  // Every item button shares one subscription.
  const buttons = useMemo(
    () => entries.flatMap((group) => group.flatMap((entry) => (entry.item ? [entry.item] : []))),
    [entries],
  );
  const states = useItemStates(editor, buttons);
  const stateOf = new Map(buttons.map((item, i) => [item.id, states[i] as ItemState]));

  // The slots, in order: a separator before each group after the first, its entries, then "More".
  const menu = overflow === 'menu';
  const slots = useMemo(() => {
    const list: (ToolbarSlot & { key: string; entry?: Entry })[] = [];
    let order = 0;
    entries.forEach((group, g) => {
      if (g > 0) list.push({ kind: 'separator', group: g, key: `separator-${g}` });
      for (const entry of group) {
        list.push({
          kind: 'entry',
          group: g,
          key: entry.key,
          entry,
          order: menu && entry.movable ? order++ : undefined,
        });
      }
    });
    if (menu) list.push({ kind: 'more', group: entries.length, key: 'more' });
    return list;
  }, [entries, menu]);

  const movable = slots.filter((slot) => slot.order !== undefined).length;
  const [keep, setKeep] = useState(Number.POSITIVE_INFINITY);
  const shown = useMemo(() => visibleSlots(slots, Math.min(keep, movable)), [slots, keep, movable]);
  const toolbar = useRef<HTMLDivElement | null>(null);

  // Lay every slot out on one line, read the widths, and keep what fits.
  // The attribute shows them all for the one synchronous read, so nothing
  // paints in between.
  const refit = useCallback(() => {
    const el = toolbar.current;
    if (!menu || !el) return;
    el.setAttribute('data-measuring', '');
    const widths = Array.from(el.querySelectorAll<HTMLElement>(':scope > [data-tei-slot]'), extent);
    el.removeAttribute('data-measuring');
    const style = getComputedStyle(el);
    const available = el.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
    setKeep(fitToolbar(slots, widths, available, px(style.columnGap)));
  }, [menu, slots]);

  // After every render: labels change width (the block type's name).
  useLayoutEffect(refit);
  useEffect(() => {
    const el = toolbar.current;
    if (!menu || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => refit());
    observer.observe(el);
    // Widths change again once web fonts arrive.
    document.fonts?.ready.then(() => refit());
    return () => observer.disconnect();
  }, [menu, refit]);

  const hidden = useMemo(() => {
    const moved: { group: number; movable: Movable; key: string }[] = [];
    slots.forEach((slot, i) => {
      if (slot.entry?.movable && !shown[i]) {
        moved.push({ group: slot.group, movable: slot.entry.movable, key: slot.key });
      }
    });
    return moved;
  }, [slots, shown]);

  // It often sits outside `<EditorContent>`: what it renders (icons, controls) gets the editor here.
  return (
    <TeiEditorContext.Provider value={editor}>
      <Toolbar ref={toolbar} aria-label={editor.t('toolbar.label')} overflow={overflow} {...rest}>
        {slots.map((slot, i) => (
          <div
            key={slot.key}
            className="tei-toolbar-slot"
            data-tei-slot={slot.kind}
            hidden={!shown[i]}
          >
            {slot.kind === 'separator' ? (
              <Separator />
            ) : slot.kind === 'more' ? (
              <MoreMenu editor={editor} moved={hidden} />
            ) : (
              slot.entry?.render(slot.entry.item ? stateOf.get(slot.entry.item.id) : undefined)
            )}
          </div>
        ))}
      </Toolbar>
    </TeiEditorContext.Provider>
  );
}

/** A computed length in pixels; `normal` and unset are 0. */
const px = (value: string) => Number.parseFloat(value) || 0;

/** A slot's width with its margins; a slot is `display: contents`, so it is its children's span. */
function extent(slot: HTMLElement): number {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const child of Array.from(slot.children)) {
    const box = child.getBoundingClientRect();
    if (box.width === 0) continue;
    const style = getComputedStyle(child);
    start = Math.min(start, box.left - px(style.marginLeft));
    end = Math.max(end, box.right + px(style.marginRight));
  }
  return end > start ? end - start : 0;
}

/** What didn't fit, as a menu: items as items, controls as submenus, by group. */
function MoreMenu({
  editor,
  moved,
}: {
  editor: TeiEditor;
  moved: readonly { group: number; movable: Movable; key: string }[];
}) {
  const items = useMemo(
    () =>
      moved.flatMap(({ movable }) => ('item' in movable ? [movable.item] : movable.submenu.items)),
    [moved],
  );
  const states = useItemStates(editor, items);
  const stateOf = new Map(items.map((item, i) => [item, states[i] as ItemState]));
  const groups: MenuGroupData[] = [];
  for (const { group, movable, key } of moved) {
    if (groups.at(-1)?.id !== String(group)) groups.push({ id: String(group), items: [] });
    const entries = groups.at(-1)?.items as MenuItemData[];
    if ('item' in movable) {
      const { item } = movable;
      const state = stateOf.get(item);
      entries.push(itemMenuData(editor, item, state, item.active ? state?.active : undefined));
      continue;
    }
    const sub = movable.submenu.items.map((item) => {
      const state = stateOf.get(item);
      return itemMenuData(editor, item, state, state?.active ?? false);
    });
    entries.push({
      id: key,
      label: movable.submenu.label,
      icon: movable.submenu.icon,
      disabled: sub.every((entry) => entry.disabled),
      items: sub,
    });
  }
  const label = editor.t('toolbar.more');
  return (
    <DropdownMenu
      data-tei-control="more"
      icon={editor.icon('more') ?? MORE}
      label={label}
      menuLabel={label}
      chevron={false}
      placement="bottom-end"
      groups={groups}
    />
  );
}

/** Three dots; an app replaces it with an icon named `more`. */
const MORE = [
  ['circle', { cx: '12', cy: '12', r: '1' }],
  ['circle', { cx: '19', cy: '12', r: '1' }],
  ['circle', { cx: '5', cy: '12', r: '1' }],
] as const;

/** An item as a menu entry: label, icon, shortcut, and whether it can run. */
function itemMenuData(
  editor: TeiEditor,
  item: TeiItem,
  state: ItemState | undefined,
  checked: boolean | undefined,
): MenuItemData {
  const text = itemText(editor, item);
  return {
    id: item.id,
    label: text.label,
    icon: item.icon,
    shortcut: text.shortcut,
    checked,
    disabled: state ? !state.enabled : false,
    onSelect: () => editor.runItem(item),
  };
}
/** A toolbar button for one item. */
export function ItemButton({
  editor,
  item,
  state,
}: {
  editor: TeiEditor;
  item: TeiItem;
  state?: ItemState;
}) {
  const { label, shortcut } = itemText(editor, item);
  return (
    <Button
      data-item={item.id}
      icon={item.icon}
      label={label}
      shortcut={shortcut}
      pressed={item.active ? state?.active : undefined}
      disabled={state ? !state.enabled : false}
      onClick={() => editor.runItem(item)}
    />
  );
}

/** The groups of the default layout. */
function defaultLayout(editor: TeiEditor, items: readonly TeiItem[]): ToolbarLayout {
  const blockTypes = editor.items('blockType');
  const menu = blockTypes.length > 1;
  const groups: string[][] = [];
  let last: string | undefined;
  for (const item of items) {
    // A plain block type (code block, quote) is in the block-type menu
    // already; lists keep their buttons, as in most editors.
    if (menu && item.group === 'basic' && blockTypes.some((b) => b.id === item.id)) continue;
    // Alignment goes in one menu; indent and outdent stay buttons beside it.
    if (isAlignment(item)) {
      if (!groups.at(-1)?.includes('align')) {
        if (last !== item.group) groups.push([]);
        groups.at(-1)?.push('align');
        last = item.group;
      }
      continue;
    }
    if (last !== item.group || groups.length === 0) groups.push([]);
    groups.at(-1)?.push(item.id);
    last = item.group;
  }
  if (menu) {
    const after = items[0]?.group === 'history' ? 1 : 0;
    groups.splice(after, 0, ['blockType']);
  }
  return groups;
}

const isAlignment = (item: TeiItem) => item.group === 'align' && item.active === 'textAlign';

// -- Built-in controls ------------------------------------------------------

/** The current block's type, and a menu to change it. */
export function BlockTypeMenu({ editor }: { editor: TeiEditor }) {
  const items = useMemo(() => editor.items('blockType'), [editor]);
  return (
    <ItemMenu
      editor={editor}
      items={items}
      kind="blockType"
      label={editor.t('toolbar.blockType')}
      fallback={0}
      showLabel
    />
  );
}

/** Alignment, as one menu showing the current one. */
export function AlignMenu({ editor }: { editor: TeiEditor }) {
  const items = useMemo(() => editor.items('toolbar').filter(isAlignment), [editor]);
  return (
    <ItemMenu
      editor={editor}
      items={items}
      kind="align"
      label={editor.t('toolbar.align')}
      fallback={0}
    />
  );
}

/**
 * A menu of items with one current (lit) item, shown on the trigger: the
 * shape both built-in menus share, for controls of your own too.
 */
export function ItemMenu({
  editor,
  items,
  kind,
  label,
  fallback,
  showLabel = false,
}: {
  editor: TeiEditor;
  items: readonly TeiItem[];
  kind: string;
  label: string;
  /** Which item the trigger shows when none is active. */
  fallback?: number;
  /** Show the current item's name on the trigger, not only its icon. */
  showLabel?: boolean;
}) {
  const states = useItemStates(editor, items);
  const current = states.findIndex((state) => state.active);
  const shown = items[current >= 0 ? current : (fallback ?? 0)];
  const enabled = states.some((state) => state.enabled);
  const menu = items.map((item, i) => itemMenuData(editor, item, states[i], i === current));
  if (!shown) return null;
  const shownLabel = editor.t(shown.label);
  return (
    <DropdownMenu
      data-item={kind}
      data-tei-control={kind}
      icon={shown.icon}
      label={showLabel ? `${label}: ${shownLabel}` : label}
      aria-label={`${label}: ${shownLabel}`}
      menuLabel={label}
      disabled={!enabled}
      items={menu}
    >
      {showLabel ? <span className="tei-control-label">{shownLabel}</span> : undefined}
    </DropdownMenu>
  );
}

BlockTypeMenu.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => {
  const items = editor.items('blockType');
  return { label: editor.t('toolbar.blockType'), icon: items[0]?.icon, items };
};

AlignMenu.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => {
  const items = editor.items('toolbar').filter(isAlignment);
  return { label: editor.t('toolbar.align'), icon: items[0]?.icon, items };
};

const BUILT_IN_CONTROLS: Record<string, ToolbarControl> = {
  blockType: BlockTypeMenu,
  align: AlignMenu,
};
