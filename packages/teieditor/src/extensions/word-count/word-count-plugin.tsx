import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

export interface WordCountPluginProps {
  showCharacters?: boolean;
}

// Average reading speed used to estimate reading time. ~200 wpm is the
// commonly cited figure for online prose; tweak via config if needed.
const WPM = 200;

export function WordCountPlugin({ showCharacters = true }: WordCountPluginProps): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const text = $getRoot().getTextContent();
        const trimmed = text.trim();
        setChars(trimmed.length);
        setWords(trimmed === '' ? 0 : trimmed.split(/\s+/).length);
      });
    });
  }, [editor]);

  const readingMinutes = Math.max(1, Math.ceil(words / WPM));

  return (
    <div className="tei-word-count flex items-center justify-end gap-3 border-t border-[hsl(var(--tei-border))] px-3 py-1.5 text-xs text-[hsl(var(--tei-muted-fg))]">
      <span>
        {words} {words === 1 ? 'word' : 'words'}
      </span>
      {showCharacters && (
        <span>
          {chars} {chars === 1 ? 'char' : 'chars'}
        </span>
      )}
      {words > 0 && <span>~{readingMinutes} min read</span>}
    </div>
  );
}
