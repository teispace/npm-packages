import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  CHECK_LIST,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
} from '@lexical/markdown';
import type { LexicalEditor } from 'lexical';

const TRANSFORMERS = [
  HEADING,
  QUOTE,
  CODE,
  UNORDERED_LIST,
  ORDERED_LIST,
  CHECK_LIST,
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  INLINE_CODE,
  ITALIC_STAR,
  STRIKETHROUGH,
  LINK,
];

/**
 * Convert markdown string to editor content.
 * Call inside `editor.update()`.
 */
export function markdownToHtml(markdown: string): void {
  $convertFromMarkdownString(markdown, TRANSFORMERS);
}

/**
 * Convert editor content to markdown string.
 * Call inside `editor.getEditorState().read()`.
 */
export function htmlToMarkdown(): string {
  return $convertToMarkdownString(TRANSFORMERS);
}

/**
 * Convenience: import markdown into a given editor instance.
 */
export function importMarkdown(editor: LexicalEditor, markdown: string): void {
  editor.update(() => {
    $convertFromMarkdownString(markdown, TRANSFORMERS);
  });
}

/**
 * Convenience: export markdown from a given editor instance.
 */
export function exportMarkdown(editor: LexicalEditor): string {
  let md = '';
  editor.getEditorState().read(() => {
    md = $convertToMarkdownString(TRANSFORMERS);
  });
  return md;
}
