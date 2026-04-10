import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
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
 */
export function InitialValuePlugin({ value, format = 'html' }: InitialValuePluginProps) {
  const [editor] = useLexicalComposerContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (!value || initialized.current) return;
    initialized.current = true;

    // Small delay to ensure editor is fully mounted
    queueMicrotask(() => {
      deserialize(editor, value, format);
    });
  }, [editor, value, format]);

  return null;
}
