import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
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
import { $getRoot, $insertNodes, type LexicalEditor } from 'lexical';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SerializationFormat = 'html' | 'markdown' | 'json' | 'text';

// ---------------------------------------------------------------------------
// Transformers (shared between import and export)
// ---------------------------------------------------------------------------

const MD_TRANSFORMERS = [
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

// ---------------------------------------------------------------------------
// Export (editor → string)
// ---------------------------------------------------------------------------

/**
 * Export editor content to the specified format.
 * Must be called inside `editor.getEditorState().read()` or `editor.update()`.
 *
 * @example
 * ```ts
 * editor.getEditorState().read(() => {
 *   const html = $serialize('html', editor);
 *   const md = $serialize('markdown', editor);
 * });
 * ```
 */
export function $serialize(format: SerializationFormat, editor: LexicalEditor): string {
  switch (format) {
    case 'html':
      return $generateHtmlFromNodes(editor);
    case 'markdown':
      return $convertToMarkdownString(MD_TRANSFORMERS);
    case 'json':
      return JSON.stringify(editor.getEditorState().toJSON());
    case 'text':
      return $getRoot().getTextContent();
    default:
      return $generateHtmlFromNodes(editor);
  }
}

/**
 * Convenience: export content from an editor instance (no need to wrap in read).
 *
 * @example
 * ```ts
 * const html = serialize(editor, 'html');
 * const markdown = serialize(editor, 'markdown');
 * const json = serialize(editor, 'json');
 * const text = serialize(editor, 'text');
 * ```
 */
export function serialize(editor: LexicalEditor, format: SerializationFormat): string {
  let result = '';
  editor.getEditorState().read(() => {
    result = $serialize(format, editor);
  });
  return result;
}

// ---------------------------------------------------------------------------
// Import (string → editor)
// ---------------------------------------------------------------------------

/**
 * Import content into the editor from the specified format.
 * Must be called inside `editor.update()`.
 *
 * @example
 * ```ts
 * editor.update(() => {
 *   $deserialize('<h1>Hello</h1><p>World</p>', 'html', editor);
 * });
 * ```
 */
export function $deserialize(
  value: string,
  format: SerializationFormat,
  editor: LexicalEditor,
): void {
  const root = $getRoot();
  root.clear();

  switch (format) {
    case 'html': {
      const parser = new DOMParser();
      const dom = parser.parseFromString(value, 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);
      $insertNodes(nodes);
      break;
    }
    case 'markdown': {
      $convertFromMarkdownString(value, MD_TRANSFORMERS);
      break;
    }
    case 'json': {
      const state = editor.parseEditorState(value);
      editor.setEditorState(state);
      break;
    }
    case 'text': {
      // For plain text, insert as paragraphs split by newlines
      const parser = new DOMParser();
      const html = value
        .split('\n')
        .map((line) => `<p>${line || '<br>'}</p>`)
        .join('');
      const dom = parser.parseFromString(html, 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);
      $insertNodes(nodes);
      break;
    }
  }
}

/**
 * Convenience: import content into an editor instance (no need to wrap in update).
 *
 * @example
 * ```ts
 * deserialize(editor, '# Hello\n\nWorld', 'markdown');
 * deserialize(editor, '<h1>Hello</h1>', 'html');
 * deserialize(editor, '{"root":...}', 'json');
 * ```
 */
export function deserialize(
  editor: LexicalEditor,
  value: string,
  format: SerializationFormat,
): void {
  if (format === 'json') {
    // JSON deserialization uses setEditorState, not update()
    const state = editor.parseEditorState(value);
    editor.setEditorState(state);
    return;
  }
  editor.update(() => {
    $deserialize(value, format, editor);
  });
}
