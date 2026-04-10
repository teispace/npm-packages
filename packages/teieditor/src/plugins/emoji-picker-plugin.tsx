'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Emoji data (basic set — extendable via config)
// ---------------------------------------------------------------------------

const BASE_EMOJIS: Array<{ emoji: string; aliases: string[] }> = [
  { emoji: '😀', aliases: ['grinning', 'smile', 'happy'] },
  { emoji: '😂', aliases: ['joy', 'laugh', 'lol'] },
  { emoji: '😍', aliases: ['heart_eyes', 'love'] },
  { emoji: '🤔', aliases: ['thinking', 'hmm'] },
  { emoji: '👍', aliases: ['thumbsup', 'yes', 'ok'] },
  { emoji: '👎', aliases: ['thumbsdown', 'no'] },
  { emoji: '❤️', aliases: ['heart', 'love', 'red_heart'] },
  { emoji: '🔥', aliases: ['fire', 'hot', 'lit'] },
  { emoji: '✅', aliases: ['check', 'done', 'complete'] },
  { emoji: '❌', aliases: ['x', 'cross', 'wrong'] },
  { emoji: '⭐', aliases: ['star', 'favorite'] },
  { emoji: '🎉', aliases: ['tada', 'party', 'celebration'] },
  { emoji: '🚀', aliases: ['rocket', 'launch', 'ship'] },
  { emoji: '💡', aliases: ['bulb', 'idea', 'tip'] },
  { emoji: '⚠️', aliases: ['warning', 'alert', 'caution'] },
  { emoji: '📝', aliases: ['memo', 'note', 'write'] },
  { emoji: '🔗', aliases: ['link', 'chain', 'url'] },
  { emoji: '📎', aliases: ['paperclip', 'attach'] },
  { emoji: '📌', aliases: ['pushpin', 'pin'] },
  { emoji: '🏷️', aliases: ['label', 'tag'] },
  { emoji: '📁', aliases: ['folder', 'directory'] },
  { emoji: '🗑️', aliases: ['trash', 'delete', 'wastebasket'] },
  { emoji: '🔒', aliases: ['lock', 'secure', 'private'] },
  { emoji: '🔓', aliases: ['unlock', 'open'] },
  { emoji: '👀', aliases: ['eyes', 'look', 'see'] },
  { emoji: '💬', aliases: ['speech', 'comment', 'chat'] },
  { emoji: '🐛', aliases: ['bug', 'insect'] },
  { emoji: '🎨', aliases: ['art', 'palette', 'design'] },
  { emoji: '⚡', aliases: ['zap', 'lightning', 'fast'] },
  { emoji: '🌟', aliases: ['star2', 'glow', 'shine'] },
  { emoji: '😊', aliases: ['blush', 'pleased'] },
  { emoji: '😢', aliases: ['cry', 'sad'] },
  { emoji: '😎', aliases: ['cool', 'sunglasses'] },
  { emoji: '🤝', aliases: ['handshake', 'deal'] },
  { emoji: '👋', aliases: ['wave', 'hello', 'hi', 'bye'] },
  { emoji: '🙏', aliases: ['pray', 'please', 'thanks'] },
  { emoji: '💪', aliases: ['muscle', 'strong', 'flex'] },
  { emoji: '🎯', aliases: ['target', 'dart', 'goal'] },
  { emoji: '📊', aliases: ['chart', 'graph', 'stats'] },
  { emoji: '💻', aliases: ['computer', 'laptop', 'code'] },
];

// ---------------------------------------------------------------------------
// Option class
// ---------------------------------------------------------------------------

class EmojiOption extends MenuOption {
  emoji: string;
  aliases: string[];

  constructor(emoji: string, aliases: string[]) {
    super(emoji);
    this.emoji = emoji;
    this.aliases = aliases;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function EmojiPickerPlugin() {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const triggerFn = useBasicTypeaheadTriggerMatch(':', {
    minLength: 1,
    maxLength: 20,
  });

  const options = useMemo(() => {
    if (queryString === null) return [];
    const q = queryString.toLowerCase();
    return BASE_EMOJIS.filter((e) => e.aliases.some((a) => a.includes(q)))
      .slice(0, 10)
      .map((e) => new EmojiOption(e.emoji, e.aliases));
  }, [queryString]);

  const onSelectOption = useCallback(
    (option: EmojiOption, _textNode: TextNode | null, closeMenu: () => void) => {
      closeMenu();
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(option.emoji + ' ');
        }
      });
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<EmojiOption>
      options={options}
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      menuRenderFn={(
        anchorElementRef,
        { options: opts, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        if (opts.length === 0) return null;
        const anchorEl = anchorElementRef.current;
        if (!anchorEl) return null;

        return createPortal(
          <div
            className="tei-emoji-picker z-50 max-h-48 w-56 overflow-y-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg"
            role="listbox"
          >
            {opts.map((option, i) => (
              <button
                key={option.key}
                ref={(el) => option.setRefElement(el)}
                type="button"
                role="option"
                aria-selected={i === selectedIndex}
                className={[
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  i === selectedIndex
                    ? 'bg-[hsl(var(--tei-accent))] text-[hsl(var(--tei-accent-fg))]'
                    : 'text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent)/.5)]',
                ].join(' ')}
                onClick={() => selectOptionAndCleanUp(option)}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <span className="text-lg">{option.emoji}</span>
                <span className="text-xs text-[hsl(var(--tei-muted-fg))]">
                  :{option.aliases[0]}:
                </span>
              </button>
            ))}
          </div>,
          anchorEl,
        );
      }}
    />
  );
}
