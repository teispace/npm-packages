import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
} from '@lexical/markdown';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';

const TRANSFORMERS = [
  HEADING,
  QUOTE,
  CODE,
  UNORDERED_LIST,
  ORDERED_LIST,
  CHECK_LIST,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  LINK,
];

/**
 * Enables live markdown shortcuts:
 * - `#` → H1, `##` → H2, etc.
 * - `>` → blockquote
 * - `` ``` `` → code block
 * - `- ` → bullet list, `1. ` → numbered list
 * - `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``
 * - `[text](url)` → link
 */
export function MarkdownShortcutsPlugin() {
  return <MarkdownShortcutPlugin transformers={TRANSFORMERS} />;
}
