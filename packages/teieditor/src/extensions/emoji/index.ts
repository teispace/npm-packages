import { type Signal, signal } from '@lexical/extension';
import {
  $getEditor,
  $getSelection,
  $hasUpdateTag,
  $isRangeSelection,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  mergeRegister,
  TextNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { $replaceTypeahead } from '../../core/typeahead.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  clock,
  emoji as emojiIcon,
  flag,
  heart,
  leaf,
  lightbulb,
  plane,
  search,
  trophy,
  utensils,
} from '../../icons/index.js';
import { $blockOf } from '../../utils/selection.js';
import { addTypeaheadSources, Typeahead, type TypeaheadOption } from '../typeahead/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Type an emoji at the caret, and remember it as recent. */
    insertEmoji: [emoji: string];
    /** Ask the emoji picker (`<EmojiPicker>`) to open. `false` when none is mounted. */
    openEmojiPicker: [];
  }
}

/** One emoji: the character, its shortcodes (the first is its name) and search words. */
export interface EmojiEntry {
  emoji: string;
  name: string;
  shortcodes: readonly string[];
  keywords: readonly string[];
  category: string;
}

export interface EmojiCategory {
  /** `people`, `nature`, `food`, `activity`, `travel`, `objects`, `symbols`, `flags`. */
  id: string;
  emojis: readonly EmojiEntry[];
}

/** A loaded emoji set: by category, and by shortcode. */
export interface EmojiSet {
  categories: readonly EmojiCategory[];
  all: readonly EmojiEntry[];
  byShortcode: ReadonlyMap<string, EmojiEntry>;
}

/** Read the compact data format (see `data.ts`) into an {@link EmojiSet}. */
export function parseEmojiData(
  data: readonly (readonly [category: string, entries: string])[],
): EmojiSet {
  const seen = new Set<string>();
  const byShortcode = new Map<string, EmojiEntry>();
  const categories = data.map(([id, entries]): EmojiCategory => {
    const emojis: EmojiEntry[] = [];
    for (const entry of entries.split('|')) {
      const [char, codes, ...keywords] = entry.split(' ');
      if (!char || !codes || seen.has(char)) continue;
      seen.add(char);
      const shortcodes = codes.split(',');
      const emoji: EmojiEntry = {
        emoji: char,
        name: shortcodes[0] as string,
        shortcodes,
        keywords,
        category: id,
      };
      for (const code of shortcodes) if (!byShortcode.has(code)) byShortcode.set(code, emoji);
      emojis.push(emoji);
    }
    return { id, emojis };
  });
  return { categories, all: categories.flatMap((c) => c.emojis), byShortcode };
}

/**
 * Emoji for a query, best first: a shortcode that starts with it, then one
 * with a word (after `_`) that does, then a search word, then anywhere.
 */
export function searchEmoji(set: EmojiSet, query: string, limit = Infinity): EmojiEntry[] {
  const q = query.toLowerCase().replace(/^:|:$/g, '');
  if (!q) return set.all.slice(0, limit);
  // [score, shortest matching code, order]: the closest code first, `smile` before `smiley`.
  const scored: Array<[number, number, number, EmojiEntry]> = [];
  set.all.forEach((emoji, order) => {
    let score = 0;
    let length = Infinity;
    for (const code of emoji.shortcodes) {
      const s =
        code === q
          ? 5
          : code.startsWith(q)
            ? 4
            : code.split('_').some((word) => word.startsWith(q))
              ? 3
              : 0;
      if (s > score || (s === score && s > 0 && code.length < length)) {
        score = s;
        length = code.length;
      }
    }
    if (score < 2 && emoji.keywords.some((word) => word.startsWith(q))) score = 2;
    if (score < 1 && emoji.shortcodes.some((code) => code.includes(q))) score = 1;
    if (score > 0) scored.push([score, length, order, emoji]);
  });
  return scored
    .sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2])
    .slice(0, limit)
    .map(([, , , emoji]) => emoji);
}

/** The built-in set, loaded once on first use. */
let builtIn: Promise<EmojiSet> | undefined;
export const loadBuiltInEmoji = (): Promise<EmojiSet> => {
  builtIn ??= import('./data.js').then((module) => parseEmojiData(module.EMOJI_DATA));
  return builtIn;
};

export interface EmojiOptions {
  /** Replace `:shortcode:` with its emoji as the closing colon is typed. Default true. */
  shortcodes: boolean;
  /** List matches after `:` and two letters. Default true. */
  suggest: boolean;
  /** How many matches the list shows. Default 8. */
  limit: number;
  /** Where the recent list starts, most recent first: what you saved from `onRecentChange`. */
  recent: readonly string[];
  /** Called with the new recent list each time an emoji is used, to save it. */
  onRecentChange: ((recent: readonly string[]) => void) | null;
  /** How many recent emoji to keep. Default 24. */
  maxRecent: number;
  /** Load the emoji set. Default: the built-in set, a lazily loaded module. */
  load: () => Promise<EmojiSet>;
}

export interface EmojiStorage {
  /** Recently used, most recent first. */
  readonly recent: Signal<readonly string[]>;
  /** The set, once loaded. */
  readonly set: Signal<EmojiSet | null>;
  /** `openEmojiPicker`'s requests, to the picker (`<EmojiPicker>`). */
  readonly picker: UiRequest;
  /** Load the set (once), and keep it in `set`. */
  load(): Promise<EmojiSet>;
  /** Put an emoji at the front of the recent list. */
  remember(emoji: string): void;
}

export const EMOJI_EXTENSION = '@teispace/teieditor/emoji';

/** `:` then shortcode letters: `:+1`, `:t-rex`, `:smile`. */
const SHORTCODE_CHAR = /^[\w+-]$/;
const SHORTCODE_BEFORE_CARET = /(^|\s):([\w+-]+):$/;

/**
 * Emoji, as plain text in the document: `:smile:` turns into 😄 as you
 * type the closing colon, `:sm` lists matches to pick from with the keys,
 * and `openEmojiPicker` (⌘⌥E, the toolbar, `/emoji`) opens a picker with
 * categories, search and your recent ones. The emoji set loads only when
 * first needed. Markdown and HTML need nothing: an emoji is a character.
 */
export const Emoji = defineTeiExtension({
  name: EMOJI_EXTENSION,
  config: {
    shortcodes: true,
    suggest: true,
    limit: 8,
    recent: [],
    onRecentChange: null,
    maxRecent: 24,
    load: loadBuiltInEmoji,
  } as EmojiOptions,
  dependencies: [Typeahead],
  storage: ({ options }): EmojiStorage => {
    const set = signal<EmojiSet | null>(null);
    const recent = signal<readonly string[]>(options.recent);
    let loading: Promise<EmojiSet> | undefined;
    return {
      recent,
      set,
      picker: uiRequest(),
      load: () => {
        loading ??= options.load().then((loaded) => {
          set.value = loaded;
          return loaded;
        });
        return loading;
      },
      remember: (emoji) => {
        const next = [emoji, ...recent.peek().filter((e) => e !== emoji)].slice(
          0,
          Math.max(0, options.maxRecent),
        );
        recent.value = next;
        options.onRecentChange?.(next);
      },
    };
  },
  commands: {
    insertEmoji: {
      run: ({ storage }, emoji: string) => {
        const selection = $getSelection();
        if (!emoji || !$isRangeSelection(selection)) return false;
        selection.insertText(emoji);
        storage.remember(emoji);
      },
      can: () => $isRangeSelection($getSelection()),
    },
    openEmojiPicker: {
      run: ({ storage }) => {
        if (!$isRangeSelection($getSelection())) return false;
        void storage.load();
        return requestUi(storage.picker);
      },
      can: ({ storage }) => hasUi(storage.picker) && $isRangeSelection($getSelection()),
    },
  },
  keymap: {
    emojiPicker: { key: 'Mod-Alt-e', command: 'openEmojiPicker', description: 'Emoji' },
  },
  icons: {
    emoji: emojiIcon,
    clock,
    search,
    leaf,
    utensils,
    trophy,
    plane,
    lightbulb,
    heart,
    flag,
  },
  messages: {
    'emoji.insert': 'Emoji',
    'emoji.insert.description': 'Insert an emoji',
    'emoji.label': 'Emoji',
    'emoji.search': 'Search emoji',
    'emoji.empty': 'No emoji found',
    'emoji.loading': 'Loading emoji…',
    'emoji.category.recent': 'Recent',
    'emoji.category.people': 'Smileys & people',
    'emoji.category.nature': 'Animals & nature',
    'emoji.category.food': 'Food & drink',
    'emoji.category.activity': 'Activities',
    'emoji.category.travel': 'Travel & places',
    'emoji.category.objects': 'Objects',
    'emoji.category.symbols': 'Symbols',
    'emoji.category.flags': 'Flags',
  },
  items: [
    {
      id: 'emoji',
      label: 'emoji.insert',
      description: 'emoji.insert.description',
      icon: 'emoji',
      in: ['toolbar', 'slash', 'insert'],
      group: 'insert',
      order: 40,
      keywords: ['emoji', 'smiley', 'emoticon', 'reaction'],
      shortcut: 'emojiPicker',
      command: 'openEmojiPicker',
    },
  ],
  register: ({ lexical, editor, storage, options }) => {
    const $replaceShortcode = (node: TextNode) => {
      if (!options.shortcodes || !node.isSimpleText() || node.hasFormat('code')) return;
      if ($hasUpdateTag(HISTORIC_TAG) || $hasUpdateTag(COLLABORATION_TAG)) return;
      const selection = $getSelection();
      if (
        !$isRangeSelection(selection) ||
        !selection.isCollapsed() ||
        selection.anchor.key !== node.getKey() ||
        $getEditor().isComposing()
      )
        return;
      const before = node.getTextContent().slice(0, selection.anchor.offset);
      if (!before.includes(':')) return;
      const set = storage.set.peek();
      if (!set) {
        // In time for the closing colon: the set loads as the code is typed.
        void storage.load();
        return;
      }
      const found = SHORTCODE_BEFORE_CARET.exec(before);
      const emoji = found && set.byShortcode.get((found[2] as string).toLowerCase());
      if (!found || !emoji || $blockOf(node)?.getType() === 'code') return;
      const start = found.index + (found[1] as string).length;
      node.spliceText(start, before.length - start, emoji.emoji, true);
      storage.remember(emoji.emoji);
    };

    const toOption = (emoji: EmojiEntry): TypeaheadOption => ({
      id: emoji.name,
      label: `:${emoji.name}:`,
      glyph: emoji.emoji,
    });

    return mergeRegister(
      lexical.registerNodeTransform(TextNode, $replaceShortcode),
      addTypeaheadSources(editor, () =>
        options.suggest
          ? [
              {
                id: 'emoji',
                trigger: ':',
                label: 'emoji.label',
                allow: (char) => SHORTCODE_CHAR.test(char),
                minLength: 2,
                maxLength: 32,
                empty: null,
                search: (query) => {
                  const set = storage.set.peek();
                  const find = (loaded: EmojiSet) =>
                    searchEmoji(loaded, query, options.limit).map(toOption);
                  return set ? find(set) : storage.load().then(find);
                },
                select: (option, match) => {
                  if (!option.glyph || !$replaceTypeahead(match, option.glyph)) return;
                  storage.remember(option.glyph);
                },
              },
            ]
          : [],
      ),
    );
  },
});
