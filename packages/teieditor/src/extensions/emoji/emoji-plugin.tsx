import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  TextNode,
} from 'lexical';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_LIST, type EmojiItem } from './emoji-data.js';

export interface EmojiPluginProps {
  /** Additional emoji items beyond the default set. */
  extraEmojis?: EmojiItem[];
}

export function EmojiPlugin({ extraEmojis = [] }: EmojiPluginProps = {}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allEmojis = useMemo(() => [...EMOJI_LIST, ...extraEmojis], [extraEmojis]);

  // Track ":" trigger
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setQuery(null);
          return;
        }
        const anchor = selection.anchor;
        if (anchor.type !== 'text') {
          setQuery(null);
          return;
        }
        const node = anchor.getNode();
        if (!(node instanceof TextNode)) {
          setQuery(null);
          return;
        }

        const text = node.getTextContent().slice(0, anchor.offset);
        const match = text.match(/(^|\s):([a-zA-Z0-9_+-]*)$/);
        if (!match || match[2]!.length < 1) {
          setQuery(null);
          return;
        }

        setQuery(match[2]!);
        const domSel = window.getSelection();
        if (domSel && domSel.rangeCount > 0) {
          setAnchorRect(domSel.getRangeAt(0).getBoundingClientRect());
        }
      });
    });
  }, [editor]);

  const filtered = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return allEmojis
      .filter((e) => e.name.includes(q) || e.keywords.some((k) => k.includes(q)))
      .slice(0, 20);
  }, [query, allEmojis]);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (item: EmojiItem) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        if (!(node instanceof TextNode)) return;

        const text = node.getTextContent();
        const offset = selection.anchor.offset;
        const colonIdx = text.lastIndexOf(':', offset - 1);
        if (colonIdx < 0) return;

        const before = text.slice(0, colonIdx);
        const after = text.slice(offset);
        node.setTextContent(before + item.emoji + after);
        selection.anchor.set(node.__key, before.length + item.emoji.length, 'text');
        selection.focus.set(node.__key, before.length + item.emoji.length, 'text');
      });
      setQuery(null);
    },
    [editor],
  );

  // Keyboard nav
  useEffect(() => {
    if (query === null || filtered.length === 0) return;
    const unsubs = [
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (e) => {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filtered.length);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (e) => {
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (e) => {
          if (filtered[selectedIndex]) {
            e?.preventDefault();
            handleSelect(filtered[selectedIndex]);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          setQuery(null);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [editor, query, filtered, selectedIndex, handleSelect]);

  if (query === null || !anchorRect || filtered.length === 0) return null;

  return createPortal(
    <div
      className="tei-emoji-menu fixed z-50 w-64 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ top: anchorRect.bottom + 8, left: anchorRect.left }}
      role="listbox"
    >
      {filtered.map((item, i) => (
        <button
          key={item.emoji}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
            i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          }`}
          onClick={() => handleSelect(item)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="text-lg">{item.emoji}</span>
          <span className="truncate text-muted-foreground">{item.name}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
