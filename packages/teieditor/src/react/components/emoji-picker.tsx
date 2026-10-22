'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import {
  Emoji,
  type EmojiEntry,
  type EmojiStorage,
  searchEmoji,
} from '../../extensions/emoji/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import type { FloatingAnchor } from '../ui/floating.js';
import { Popover } from '../ui/popover.js';
import { useSignal } from '../use-signal.js';
import { useUiRequest } from '../use-ui-request.js';

export interface EmojiPickerProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/** Each category's icon. */
const CATEGORY_ICONS: Record<string, string> = {
  recent: 'clock',
  people: 'emoji',
  nature: 'leaf',
  food: 'utensils',
  activity: 'trophy',
  travel: 'plane',
  objects: 'lightbulb',
  symbols: 'heart',
  flags: 'flag',
};

const storageOf = (editor: TeiEditor) =>
  editor.extension(Emoji)?.output.storage as EmojiStorage | undefined;

/**
 * The emoji picker `openEmojiPicker` opens (⌘⌥E, the toolbar's Emoji,
 * `/emoji`), at the caret: search, categories, your recent ones. Arrow
 * keys move through the grid, Enter picks, Escape closes and gives the
 * document back its caret. Needs the Emoji extension.
 *
 * Render it once inside `<EditorContent>`.
 */
export function EmojiPicker({ editor: editorProp }: EmojiPickerProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <EmojiPicker> needs an `editor` prop or a provider');
  const storage = storageOf(editor);
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);
  useUiRequest(storage?.picker, () => {
    const root = editor.lexical.getRootElement();
    setAnchor(selectionAnchor(editor) ?? root);
  });
  if (!storage || !anchor) return null;
  const close = (refocus: boolean) => {
    setAnchor(null);
    if (refocus) editor.focus();
  };
  return (
    <TeiEditorContext.Provider value={editor}>
      <Popover
        open
        anchor={anchor}
        placement="bottom-start"
        initialFocus="first"
        restoreFocus={false}
        onDismiss={(reason) => close(reason === 'escape')}
        data-tei-control="emoji-picker"
        role="dialog"
        aria-label={editor.t('emoji.label')}
      >
        <EmojiPanel
          editor={editor}
          onPick={(emoji) => {
            close(false);
            editor.chain().focus().insertEmoji(emoji).run();
          }}
        />
      </Popover>
    </TeiEditorContext.Provider>
  );
}

export interface EmojiPanelProps {
  editor: TeiEditor;
  /** Called with the emoji picked. */
  onPick: (emoji: string) => void;
  /** Columns in the grid, for the arrow keys when the layout cannot say. Default 8. */
  columns?: number;
}

/**
 * The picker's content without a popover, for a picker of your own
 * (reactions, a status). Search, category tabs, recent, and a grid with
 * arrow-key navigation (one tab stop, roving focus).
 */
export function EmojiPanel({ editor, onPick, columns = 8 }: EmojiPanelProps) {
  const storage = storageOf(editor) as EmojiStorage;
  const set = useSignal(storage.set);
  const recent = useSignal(storage.recent);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [named, setNamed] = useState<EmojiEntry | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const gridId = `tei-emoji${autoId.replace(/:/g, '')}`;

  useEffect(() => {
    void storage.load();
  }, [storage]);

  const byChar = useMemo(() => new Map(set?.all.map((e) => [e.emoji, e])), [set]);
  const recentEntries = useMemo(
    () =>
      recent.map(
        (char) =>
          byChar.get(char) ?? {
            emoji: char,
            name: char,
            shortcodes: [],
            keywords: [],
            category: 'recent',
          },
      ),
    [recent, byChar],
  );
  const tabs = useMemo(
    () => [...(recent.length ? ['recent'] : []), ...(set?.categories.map((c) => c.id) ?? [])],
    [recent.length, set],
  );
  const shown = category && tabs.includes(category) ? category : (tabs[0] ?? null);

  const list: readonly EmojiEntry[] = useMemo(() => {
    if (!set) return [];
    if (query.trim()) return searchEmoji(set, query.trim(), 120);
    if (shown === 'recent') return recentEntries;
    return set.categories.find((c) => c.id === shown)?.emojis ?? [];
  }, [set, query, shown, recentEntries]);

  // A new list starts at its first emoji.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets on the list only
  useEffect(() => setActive(0), [list]);

  const cells = () => Array.from(grid.current?.querySelectorAll<HTMLElement>('[data-emoji]') ?? []);
  const focusCell = (index: number) => {
    const next = Math.max(0, Math.min(index, list.length - 1));
    setActive(next);
    cells()[next]?.focus();
  };
  const perRow = () => {
    const template = grid.current ? getComputedStyle(grid.current).gridTemplateColumns : '';
    const count = template && template !== 'none' ? template.trim().split(/\s+/).length : 0;
    return count || columns;
  };

  const onGridKey = (event: ReactKeyboardEvent) => {
    const rtl = grid.current ? getComputedStyle(grid.current).direction === 'rtl' : false;
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>;
    let next: number | null = null;
    if (event.key in step) next = active + (step[event.key] as number);
    else if (event.key === 'ArrowDown') next = active + perRow();
    else if (event.key === 'ArrowUp') {
      if (active < perRow()) {
        event.preventDefault();
        grid.current?.closest('[data-tei-emoji-panel]')?.querySelector('input')?.focus();
        return;
      }
      next = active - perRow();
    } else if (event.key === 'Home') next = event.ctrlKey ? 0 : active - (active % perRow());
    else if (event.key === 'End')
      next = event.ctrlKey ? list.length - 1 : active - (active % perRow()) + perRow() - 1;
    if (next === null) return;
    event.preventDefault();
    focusCell(next);
  };

  const categoryName = (id: string) => editor.t(`emoji.category.${id}`);

  return (
    <div className="tei-emoji-panel" data-tei-emoji-panel="">
      <Input
        type="search"
        value={query}
        placeholder={editor.t('emoji.search')}
        aria-label={editor.t('emoji.search')}
        aria-controls={gridId}
        enterKeyHint="done"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusCell(0);
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            const first = list[0];
            if (first) onPick(first.emoji);
          }
        }}
      />
      {!query.trim() && tabs.length > 0 && (
        <div className="tei-emoji-tabs" role="toolbar" aria-label={editor.t('emoji.label')}>
          {tabs.map((id) => (
            <Button
              key={id}
              size="sm"
              icon={CATEGORY_ICONS[id] ?? 'emoji'}
              label={categoryName(id)}
              pressed={id === shown}
              data-category={id}
              onClick={() => setCategory(id)}
            />
          ))}
        </div>
      )}
      <div
        ref={grid}
        id={gridId}
        className="tei-emoji-grid"
        role="group"
        aria-label={query.trim() ? editor.t('emoji.search') : categoryName(shown ?? 'people')}
        onKeyDown={onGridKey}
      >
        {list.map((entry, index) => (
          <button
            key={entry.emoji}
            type="button"
            className="tei-emoji-cell"
            data-emoji={entry.emoji}
            tabIndex={index === active ? 0 : -1}
            aria-label={entry.name.replace(/_/g, ' ')}
            onFocus={() => {
              setActive(index);
              setNamed(entry);
            }}
            onPointerEnter={() => setNamed(entry)}
            onClick={() => onPick(entry.emoji)}
          >
            {entry.emoji}
          </button>
        ))}
      </div>
      {(!set || list.length === 0) && (
        <div className="tei-menu-empty" role="status">
          {set ? editor.t('emoji.empty') : editor.t('emoji.loading')}
        </div>
      )}
      <div className="tei-emoji-footer" aria-hidden="true">
        {named ? (
          <>
            <span className="tei-emoji-footer-glyph">{named.emoji}</span>
            <span>{named.shortcodes.length ? `:${named.name}:` : named.name}</span>
          </>
        ) : (
          ' '
        )}
      </div>
    </div>
  );
}
