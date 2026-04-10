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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SlashCommandItem } from './types.js';

// ---------------------------------------------------------------------------
// Hook: track "/" trigger and query string
// ---------------------------------------------------------------------------

function useSlashTrigger() {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

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

        const textContent = node.getTextContent();
        const offset = anchor.offset;
        const textBeforeCursor = textContent.slice(0, offset);

        // Match "/" at start of text or after a space
        const match = textBeforeCursor.match(/(^|\s)\/([^\s]*)$/);
        if (!match) {
          setQuery(null);
          return;
        }

        setQuery(match[2]!);

        // Get cursor position for menu placement
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          setAnchorRect(range.getBoundingClientRect());
        }
      });
    });
  }, [editor]);

  return { query, anchorRect };
}

// ---------------------------------------------------------------------------
// Menu component
// ---------------------------------------------------------------------------

function SlashMenu({
  items,
  query,
  anchorRect,
  onSelect,
  onClose,
}: {
  items: SlashCommandItem[];
  query: string;
  anchorRect: DOMRect;
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editor] = useLexicalComposerContext();

  // Filter items by query
  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  }, [items, query]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  // Keyboard navigation
  useEffect(() => {
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
            onSelect(filtered[selectedIndex]);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          onClose();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [editor, filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  // Position below cursor
  const top = anchorRect.bottom + 8;
  const left = anchorRect.left;

  return createPortal(
    <div
      ref={menuRef}
      className="tei-slash-menu fixed z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ top, left }}
      role="listbox"
    >
      {filtered.map((item, index) => (
        <button
          key={item.name}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          className={`tei-slash-item flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/50'
          }`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <item.icon className="h-4 w-4" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium">{item.label}</div>
            {item.description && (
              <div className="text-xs text-muted-foreground truncate">{item.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface SlashCommandPluginProps {
  commands: SlashCommandItem[];
}

export function SlashCommandPlugin({ commands }: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext();
  const { query, anchorRect } = useSlashTrigger();

  const handleSelect = useCallback(
    (item: SlashCommandItem) => {
      // Remove the "/" trigger text before executing the command
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchor = selection.anchor;
        const node = anchor.getNode();
        if (!(node instanceof TextNode)) return;

        const text = node.getTextContent();
        const offset = anchor.offset;
        const beforeCursor = text.slice(0, offset);
        const slashIndex = beforeCursor.lastIndexOf('/');

        if (slashIndex >= 0) {
          // Remove from "/" to cursor position
          const newText = text.slice(0, slashIndex) + text.slice(offset);
          if (newText === '') {
            node.remove();
          } else {
            node.setTextContent(newText);
            selection.anchor.set(node.__key, slashIndex, 'text');
            selection.focus.set(node.__key, slashIndex, 'text');
          }
        }
      });

      // Execute command after cleanup
      item.onSelect(editor);
    },
    [editor],
  );

  const handleClose = useCallback(() => {
    // No-op — the menu auto-hides when query becomes null
  }, []);

  if (query === null || !anchorRect) return null;

  return (
    <SlashMenu
      items={commands}
      query={query}
      anchorRect={anchorRect}
      onSelect={handleSelect}
      onClose={handleClose}
    />
  );
}
