import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $isTextNode, type TextNode } from 'lexical';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Simple find & replace UI that floats at the top-right of the editor.
 * Toggled via Ctrl/Cmd+F or the custom 'tei-find-replace-toggle' event.
 */
export function FindReplacePlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle listener
  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev);
    window.addEventListener('tei-find-replace-toggle', handler);
    return () => window.removeEventListener('tei-find-replace-toggle', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Count matches
  useEffect(() => {
    if (!search) {
      setMatchCount(0);
      return;
    }
    editor.getEditorState().read(() => {
      let count = 0;
      const root = $getRoot();
      const text = root.getTextContent();
      const searchLower = search.toLowerCase();
      let idx = text.toLowerCase().indexOf(searchLower);
      while (idx !== -1) {
        count++;
        idx = text.toLowerCase().indexOf(searchLower, idx + 1);
      }
      setMatchCount(count);
    });
  }, [search, editor]);

  const handleReplace = useCallback(() => {
    if (!search) return;
    editor.update(() => {
      const root = $getRoot();
      const allTextNodes: TextNode[] = [];
      const collectText = (node: { getChildren?: () => any[] }) => {
        if ($isTextNode(node as any)) {
          allTextNodes.push(node as unknown as TextNode);
        }
        if ('getChildren' in node && typeof node.getChildren === 'function') {
          node.getChildren().forEach(collectText);
        }
      };
      collectText(root);

      for (const textNode of allTextNodes) {
        const content = textNode.getTextContent();
        const idx = content.toLowerCase().indexOf(search.toLowerCase());
        if (idx !== -1) {
          const newContent = content.slice(0, idx) + replace + content.slice(idx + search.length);
          textNode.setTextContent(newContent);
          break; // Replace one at a time
        }
      }
    });
  }, [editor, search, replace]);

  const handleReplaceAll = useCallback(() => {
    if (!search) return;
    editor.update(() => {
      const root = $getRoot();
      const allTextNodes: TextNode[] = [];
      const collectText = (node: { getChildren?: () => any[] }) => {
        if ($isTextNode(node as any)) {
          allTextNodes.push(node as unknown as TextNode);
        }
        if ('getChildren' in node && typeof node.getChildren === 'function') {
          node.getChildren().forEach(collectText);
        }
      };
      collectText(root);

      for (const textNode of allTextNodes) {
        const content = textNode.getTextContent();
        if (content.toLowerCase().includes(search.toLowerCase())) {
          const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          textNode.setTextContent(content.replace(regex, replace));
        }
      }
    });
  }, [editor, search, replace]);

  if (!isOpen) return null;

  return (
    <div className="tei-find-replace absolute right-2 top-2 z-50 flex flex-col gap-1.5 rounded-lg border border-border bg-popover p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Find..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 w-40 rounded border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
        />
        <span className="text-xs text-muted-foreground min-w-[3ch]">{matchCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Replace..."
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          className="h-7 w-40 rounded border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
        />
        <button
          type="button"
          onClick={handleReplace}
          className="h-7 rounded border border-border px-2 text-xs hover:bg-accent"
          title="Replace"
        >
          1
        </button>
        <button
          type="button"
          onClick={handleReplaceAll}
          className="h-7 rounded border border-border px-2 text-xs hover:bg-accent"
          title="Replace all"
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="h-7 rounded border border-border px-2 text-xs hover:bg-accent"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
