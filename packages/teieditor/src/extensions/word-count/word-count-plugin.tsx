import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

export interface WordCountPluginProps {
  showCharacters?: boolean;
}

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

  return (
    <div className="tei-word-count flex items-center gap-2 border-t border-border px-3 py-1 text-xs text-muted-foreground">
      <span>
        {words} {words === 1 ? 'word' : 'words'}
      </span>
      {showCharacters && (
        <span>
          · {chars} {chars === 1 ? 'character' : 'characters'}
        </span>
      )}
    </div>
  );
}
