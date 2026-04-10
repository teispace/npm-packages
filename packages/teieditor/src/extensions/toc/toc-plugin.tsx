import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $getRoot } from 'lexical';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

export interface TocEntry {
  key: string;
  text: string;
  tag: HeadingTagType;
  level: number;
}

/**
 * Hook that extracts a table of contents from headings in the editor.
 */
export function useToc(): TocEntry[] {
  const [editor] = useLexicalComposerContext();
  const [entries, setEntries] = useState<TocEntry[]>([]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const items: TocEntry[] = [];

        for (const child of root.getChildren()) {
          if ($isHeadingNode(child)) {
            const tag = child.getTag();
            const level = parseInt(tag.replace('h', ''), 10);
            items.push({
              key: child.getKey(),
              text: child.getTextContent(),
              tag,
              level,
            });
          }
        }
        setEntries(items);
      });
    });
  }, [editor]);

  return entries;
}

/**
 * Renders a table of contents sidebar. The entries auto-update as the user types.
 * Clicking an entry scrolls to the heading.
 */
export function TocPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const entries = useToc();

  if (entries.length === 0) return null;

  const scrollTo = (key: string) => {
    const elem = editor.getElementByKey(key);
    if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="tei-toc border-l border-border pl-4 text-sm" aria-label="Table of contents">
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.key} style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
            <button
              type="button"
              className="text-left text-muted-foreground hover:text-foreground transition-colors truncate max-w-full"
              onClick={() => scrollTo(entry.key)}
            >
              {entry.text || 'Untitled'}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
