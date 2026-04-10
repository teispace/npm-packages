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
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { $createMentionNode, MentionNode } from './mention-node.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MentionSuggestion {
  id: string;
  name: string;
  /** Optional avatar URL or label. */
  avatar?: string;
  /** Mention type, e.g. 'user', 'tag', 'page'. Default: 'user'. */
  type?: string;
}

export interface MentionPluginProps {
  /** Trigger character. Default: '@'. */
  trigger?: string;
  /** Async function to fetch suggestions based on query. */
  onSearch: (query: string) => Promise<MentionSuggestion[]> | MentionSuggestion[];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function MentionPlugin({ trigger = '@', onSearch }: MentionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track trigger
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
        if (!(node instanceof TextNode) || node instanceof MentionNode) {
          setQuery(null);
          return;
        }

        const text = node.getTextContent().slice(0, anchor.offset);
        const regex = new RegExp(
          `(^|\\s)${trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\s]*)$`,
        );
        const match = text.match(regex);

        if (!match) {
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
  }, [editor, trigger]);

  // Fetch suggestions
  useEffect(() => {
    if (query === null) {
      setSuggestions([]);
      return;
    }
    const result = onSearch(query);
    if (result instanceof Promise) {
      result.then(setSuggestions);
    } else {
      setSuggestions(result);
    }
    setSelectedIndex(0);
  }, [query, onSearch]);

  // Insert mention
  const handleSelect = useCallback(
    (item: MentionSuggestion) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const anchor = selection.anchor;
        const node = anchor.getNode();
        if (!(node instanceof TextNode)) return;

        const text = node.getTextContent();
        const offset = anchor.offset;
        const before = text.slice(0, offset);
        const triggerIdx = before.lastIndexOf(trigger);
        if (triggerIdx < 0) return;

        const after = text.slice(offset);
        const mentionNode = $createMentionNode(item.name, item.id, item.type || 'user');

        if (triggerIdx === 0 && after === '') {
          node.replace(mentionNode);
        } else {
          const beforeText = text.slice(0, triggerIdx);
          node.setTextContent(beforeText);
          node.insertAfter(mentionNode);
          if (after) {
            const afterNode = new TextNode(after);
            mentionNode.insertAfter(afterNode);
            afterNode.select(0, 0);
          } else {
            mentionNode.selectNext(0, 0);
          }
        }
      });
      setQuery(null);
    },
    [editor, trigger],
  );

  // Keyboard nav
  useEffect(() => {
    if (query === null || suggestions.length === 0) return;
    const unsubs = [
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (e) => {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % suggestions.length);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (e) => {
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (e) => {
          if (suggestions[selectedIndex]) {
            e?.preventDefault();
            handleSelect(suggestions[selectedIndex]);
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
  }, [editor, query, suggestions, selectedIndex, handleSelect]);

  if (query === null || !anchorRect || suggestions.length === 0) return null;

  return createPortal(
    <div
      className="tei-mention-menu fixed z-50 w-56 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ top: anchorRect.bottom + 8, left: anchorRect.left }}
      role="listbox"
    >
      {suggestions.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
            i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          }`}
          onClick={() => handleSelect(item)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          {item.avatar && <img src={item.avatar} alt="" className="h-5 w-5 rounded-full" />}
          <span className="truncate">{item.name}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
