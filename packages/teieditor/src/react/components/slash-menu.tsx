'use client';

import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from 'lexical';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import {
  $matchTypeahead,
  $replaceTypeahead,
  sameTypeahead,
  type TypeaheadPattern,
  typeaheadRange,
} from '../../core/typeahead.js';
import type { TeiItem } from '../../core/types.js';
import { useOptionalEditor } from '../context.js';
import { itemText } from '../items.js';
import { rangeAnchor } from '../selection-anchor.js';
import { Menu, type MenuGroupData, type MenuItemData, useMenuNavigation } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';

export interface SlashMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The character that opens it. Default `/`. */
  trigger?: string;
  /**
   * How well an item matches the query: a higher number ranks it higher,
   * `null` leaves it out. Default: label prefix, then word prefix, then
   * keywords, then anywhere.
   */
  match?: (item: TeiItem, query: string, label: string) => number | null;
}

/** The query may have single spaces in it ("heading 2"); two in a row is prose. */
const slashPattern = (trigger: string): TypeaheadPattern => ({ trigger, spaces: true });

/** Default ranking: label prefix, word prefix, keyword prefix, anywhere. */
export function rankSlashItem(item: TeiItem, query: string, label: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const name = label.toLowerCase();
  if (name.startsWith(q)) return 4;
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 3;
  const words = [item.id, ...(item.keywords ?? [])].map((w) => w.toLowerCase());
  if (words.some((word) => word.startsWith(q))) return 2;
  if (name.includes(q) || words.some((word) => word.includes(q))) return 1;
  return null;
}

/**
 * Type `/` to insert or turn the block into anything the extensions offer:
 * headings, lists, quotes, code, dividers, tables, images… Typing filters
 * the list; arrows move, Enter or Tab picks, Escape closes. Focus stays in
 * the document throughout, and the highlighted row is announced through
 * the document's `aria-activedescendant`.
 *
 * Render it inside `<EditorContent>` (`<Editor>` does).
 */
export function SlashMenu({
  editor: editorProp,
  trigger = '/',
  match = rankSlashItem,
}: SlashMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <SlashMenu> needs an `editor` prop or a provider');

  const all = useMemo(() => editor.items('slash'), [editor]);
  const current = useEditorState(
    (e) => (e.isEditable ? e.read(() => $matchTypeahead(slashPattern(trigger))) : null),
    { editor, equal: sameTypeahead },
  );
  const focused = useEditorFocus(editor);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const at = current ? `${current.key}:${current.offset}` : null;
  const open = Boolean(current && focused && at !== dismissed);

  const results = useMemo(() => {
    const query = current?.query ?? '';
    return all
      .map((item, order) => {
        const label = editor.t(item.label);
        return { item, label, order, score: match(item, query, label) };
      })
      .filter((r): r is typeof r & { score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score || a.order - b.order);
  }, [all, current?.query, editor, match]);

  const choose = (item: TeiItem) => {
    if (!current) return;
    // Take out the trigger and the query, then run the item where they were.
    // From a key, this update is queued behind the key's own: the item runs
    // once it is in, or an item that inserts a block would move the caret
    // first and leave the query behind.
    editor.lexical.update(() => $replaceTypeahead(current, ''), {
      discrete: true,
      onUpdate: () => editor.runItem(item),
    });
  };

  const nav = useMenuNavigation({
    count: results.length,
    onSelect: (index) => {
      const result = results[index];
      if (result) choose(result.item);
    },
  });
  // A new query starts from the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets on the query only
  useEffect(() => nav.setHighlighted(0), [current?.query]);

  // The latest navigation, for the key handler registered once per opening.
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    if (!open) return;
    return editor.lexical.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        // Escape is the popover's: it closes the list for this trigger (`onDismiss`).
        const n = navRef.current;
        const take = () => {
          event.preventDefault();
          return true;
        };
        if (event.key === 'Tab' && !event.shiftKey) {
          return n.handleKey({ key: 'Enter', altKey: false, ctrlKey: false, metaKey: false })
            ? take()
            : false;
        }
        if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) && !event.shiftKey) {
          return n.handleKey(event) ? take() : false;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, open]);

  const autoId = useId();
  const menuId = `tei-slash${autoId.replace(/:/g, '')}`;

  // The document is the combobox: it says which list it drives and which row is lit.
  useEffect(() => {
    const root = editor.lexical.getRootElement();
    if (!root || !open) return;
    root.setAttribute('aria-controls', menuId);
    root.setAttribute('aria-expanded', 'true');
    if (results.length) root.setAttribute('aria-activedescendant', `${menuId}-${nav.highlighted}`);
    else root.removeAttribute('aria-activedescendant');
    return () => {
      root.removeAttribute('aria-controls');
      root.removeAttribute('aria-expanded');
      root.removeAttribute('aria-activedescendant');
    };
  }, [editor, open, menuId, nav.highlighted, results.length]);

  // Anchored to the trigger itself, so the list stays put as the query grows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one place per trigger
  const anchor = useMemo(() => {
    if (!open || !current) return null;
    const range = typeaheadRange(editor.lexical, current);
    const element = editor.lexical.getElementByKey(current.key);
    return range && element ? rangeAnchor(range, element) : null;
  }, [editor, open, at]);

  if (!open || !anchor) return null;
  // With a query, a ranked list; without one, the items in their groups.
  if (results.length === 0 && /\s/.test(current?.query ?? '')) return null;

  const rows = (list: typeof results): MenuItemData[] =>
    list.map(({ item }) => {
      const text = itemText(editor, item);
      return {
        id: item.id,
        label: text.label,
        description: text.description,
        icon: item.icon,
        tile: true,
        shortcut: text.shortcut,
        onSelect: () => choose(item),
      };
    });
  const groups: MenuGroupData[] = current?.query
    ? [{ id: 'results', items: rows(results) }]
    : groupBy(results).map(([group, list]) => ({
        id: group,
        label: editor.t(`slash.group.${group}`),
        items: rows(list),
      }));

  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      onDismiss={() => setDismissed(at)}
      data-tei-control="slash-menu"
    >
      <Menu
        id={menuId}
        label={editor.t('slash.label')}
        groups={groups}
        navigation={nav}
        autoFocus={false}
        empty={editor.t('slash.empty')}
      />
    </Popover>
  );
}

function groupBy<T extends { item: TeiItem }>(list: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const entry of list) {
    const group = entry.item.group ?? 'other';
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  return [...groups];
}
