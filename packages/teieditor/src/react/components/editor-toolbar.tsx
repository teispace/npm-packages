'use client';

import { type ComponentType, Fragment, isValidElement, type ReactNode, useMemo } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { type ItemState, itemText, useItemStates } from '../items.js';
import { Button } from '../ui/button.js';
import { DropdownMenu } from '../ui/dropdown.js';
import type { MenuItemData } from '../ui/menu.js';
import { Separator, Toolbar, type ToolbarProps } from '../ui/toolbar.js';

/**
 * One toolbar entry: an item id (`'bold'`), a control id (`'blockType'`,
 * `'align'`, or one of `controls`), or any element. Falsy entries are skipped,
 * so `cond && 'link'` works.
 */
export type ToolbarEntry = string | ReactNode;

/** Groups of entries; a separator goes between groups. */
export type ToolbarLayout = readonly (readonly ToolbarEntry[])[];

/** A control the layout can name: it renders itself from the editor. */
export type ToolbarControl = ComponentType<{ editor: TeiEditor }>;

export interface EditorToolbarProps extends Omit<ToolbarProps, 'children'> {
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
}

/**
 * The formatting toolbar, built from what the extensions contribute: add
 * `Table` and its button appears, with no wiring. Rearrange it with
 * `layout`, add your own with `controls`, or hide an item for every UI with
 * the editor's `items: { bold: null }`.
 */
export function EditorToolbar({
  editor: editorProp,
  layout,
  controls,
  ...rest
}: EditorToolbarProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) {
    throw new Error('teieditor: <EditorToolbar> needs an `editor` prop or a provider');
  }
  const all = useMemo(() => editor.items('toolbar'), [editor]);
  const byId = useMemo(() => new Map(all.map((item) => [item.id, item])), [all]);
  const named = useMemo(() => ({ ...BUILT_IN_CONTROLS, ...controls }), [controls]);
  const groups = layout ?? defaultLayout(editor, all);

  // Every item button shares one subscription.
  const buttons = useMemo(
    () =>
      groups.flatMap((group) =>
        group.flatMap((entry) =>
          typeof entry === 'string' && !named[entry] && byId.has(entry)
            ? [byId.get(entry) as TeiItem]
            : [],
        ),
      ),
    [groups, named, byId],
  );
  const states = useItemStates(editor, buttons);
  const stateOf = new Map(buttons.map((item, i) => [item.id, states[i] as ItemState]));

  const rendered = groups
    .map((group) =>
      group
        .map((entry, i) => {
          if (entry === null || entry === undefined || entry === false || entry === '') return null;
          if (typeof entry !== 'string') {
            return isValidElement(entry) ? entry : <Fragment key={`node-${i}`}>{entry}</Fragment>;
          }
          const Control = named[entry];
          if (Control) return <Control key={entry} editor={editor} />;
          const item = byId.get(entry);
          if (!item) return null;
          return <ItemButton key={entry} editor={editor} item={item} state={stateOf.get(entry)} />;
        })
        .filter((node) => node !== null),
    )
    .filter((group) => group.length > 0);

  // It often sits outside `<EditorContent>`: what it renders (icons, controls) gets the editor here.
  return (
    <TeiEditorContext.Provider value={editor}>
      <Toolbar aria-label={editor.t('toolbar.label')} {...rest}>
        {rendered.map((group, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: groups have no identity beyond their place
          <Fragment key={i}>
            {i > 0 && <Separator />}
            {group}
          </Fragment>
        ))}
      </Toolbar>
    </TeiEditorContext.Provider>
  );
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
  const menu: MenuItemData[] = items.map((item, i) => {
    const text = itemText(editor, item);
    return {
      id: item.id,
      label: text.label,
      icon: item.icon,
      shortcut: text.shortcut,
      checked: i === current,
      disabled: !states[i]?.enabled,
      onSelect: () => editor.runItem(item),
    };
  });
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

const BUILT_IN_CONTROLS: Record<string, ToolbarControl> = {
  blockType: BlockTypeMenu,
  align: AlignMenu,
};
