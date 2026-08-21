'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HISTORY_MERGE_TAG } from 'lexical';
import { useEffect, useRef } from 'react';
import { deserialize, type SerializationFormat } from '../utils/serialization.js';

export interface InitialValuePluginProps {
  /** Initial content string. */
  value?: string;
  /** Format of the initial content. Default: 'html'. */
  format?: SerializationFormat;
}

/**
 * Sets the editor content on mount from an HTML, Markdown, JSON, or text string.
 *
 * Only runs once on mount — subsequent changes to `value` are ignored.
 * For controlled editor behavior, use the serialization utilities directly.
 *
 * The import is tagged `history-merge` so it folds into the initial history
 * entry instead of becoming its own undo step. Untagged, the very first Ctrl+Z
 * would wipe the document the editor was seeded with.
 */
export function InitialValuePlugin({ value, format = 'html' }: InitialValuePluginProps) {
  const [editor] = useLexicalComposerContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (!value || initialized.current) return;
    initialized.current = true;

    // Small delay to ensure editor is fully mounted
    queueMicrotask(() => {
      deserialize(editor, value, format, { tag: HISTORY_MERGE_TAG });
    });
  }, [editor, value, format]);

  return null;
}
