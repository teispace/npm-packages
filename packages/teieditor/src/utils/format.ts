import { FORMAT_TEXT_COMMAND, type LexicalEditor, type TextFormatType } from 'lexical';

/**
 * Dispatch a Lexical FORMAT_TEXT_COMMAND for the given format type.
 */
export function toggleFormat(editor: LexicalEditor, format: TextFormatType): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
}
