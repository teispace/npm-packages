'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTeiChromeSlot } from '../../core/context.js';

export interface WordCountPluginProps {
  showCharacters?: boolean;
}

// Average reading speed used to estimate reading time. ~200 wpm is the
// commonly cited figure for online prose; tweak via config if needed.
const WPM = 200;

export function WordCountPlugin({
  showCharacters = true,
}: WordCountPluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const slot = useTeiChromeSlot();
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

  const statusBar = (
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

  // Mounted standalone (no <TeiEditorProvider>): the caller chose the position
  // by placing this component, so render where we are.
  if (!slot.inProvider) return statusBar;
  // Inside a provider we are mounted alongside the other extension plugins,
  // above the toolbar — never a valid spot for a status bar. Portal into the
  // host's <TeiEditorSlot>, or render nothing if the host didn't place one.
  return slot.element ? createPortal(statusBar, slot.element) : null;
}
