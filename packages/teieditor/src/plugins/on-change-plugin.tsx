import { OnChangePlugin as LexicalOnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import type { EditorState, LexicalEditor } from 'lexical';
import { $serialize, type SerializationFormat } from '../utils/serialization.js';

export type OutputFormat = SerializationFormat;

export interface OnChangePluginProps {
  /** Called whenever editor content changes. */
  onChange?: (value: string, editorState: EditorState) => void;
  /** Output format: 'html' | 'markdown' | 'json' | 'text'. Default: 'html'. */
  format?: OutputFormat;
  /** Whether to ignore selection-only changes. Default: true. */
  ignoreSelectionChange?: boolean;
}

/**
 * Bridges Lexical's onChange to a simple string callback.
 * Supports HTML, Markdown, JSON, and plain text output.
 */
export function OnChangePlugin({
  onChange,
  format = 'html',
  ignoreSelectionChange = true,
}: OnChangePluginProps) {
  if (!onChange) return null;

  const handleChange = (editorState: EditorState, _editor: LexicalEditor) => {
    editorState.read(() => {
      const value = $serialize(format, _editor);
      onChange(value, editorState);
    });
  };

  return (
    <LexicalOnChangePlugin onChange={handleChange} ignoreSelectionChange={ignoreSelectionChange} />
  );
}
