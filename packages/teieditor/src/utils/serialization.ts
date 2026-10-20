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
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  type LexicalEditor,
  type UpdateTag,
} from 'lexical';

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
 * Must be called inside `editor.read()` or `editor.update()` — the active
 * editor has to be bound for the `'html'` format, since Lexical 0.45 resolves
 * the editor from context during DOM export. (`editorState.read()` alone does
 * not bind the editor; pass `{ editor }` if you use that form.)
 *
 * @example
 * ```ts
 * editor.read(() => {
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
  // `editor.read` (not `editorState.read`) binds the active editor so
  // DOM-export serializers like `$generateHtmlFromNodes` can resolve it.
  // Required since Lexical 0.45.
  editor.read(() => {
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
  options: Pick<DeserializeOptions, 'htmlPolicy'> = {},
): void {
  const root = $getRoot();
  root.clear();

  switch (format) {
    case 'html': {
      // Under `require-trusted-types-for 'script'` parseFromString accepts only
      // TrustedHTML, so the string goes through the caller's policy first.
      const html = options.htmlPolicy ? options.htmlPolicy.createHTML(value) : value;
      const dom = new DOMParser().parseFromString(html as string, 'text/html');
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
      // Plain text must stay plain: HTML-escape each line before building the
      // paragraph markup, otherwise embedded tags (e.g. `<img onerror=...>` or
      // a `<script>`) round-trip through DOMParser into real editor nodes —
      // structural/content injection from supposedly inert text. We build
      // ParagraphNode/TextNode directly so there is no HTML parse step at all.
      const lines = value.split('\n');
      const paragraphs = lines.map((line) => {
        const paragraph = $createParagraphNode();
        if (line.length > 0) {
          paragraph.append($createTextNode(line));
        }
        return paragraph;
      });
      $insertNodes(paragraphs);
      break;
    }
  }
}

export interface DeserializeOptions {
  /**
   * Lexical update tag(s) to attach to the import.
   *
   * Pass `HISTORY_MERGE_TAG` (`'history-merge'`) for content the user should
   * never be able to undo away — seeding the editor with its initial document,
   * for instance. Without it the import lands on the undo stack as its own
   * entry and a single Ctrl+Z empties the document.
   */
  tag?: UpdateTag | UpdateTag[];
  /**
   * A Trusted Types policy for HTML import. Pages that enforce
   * `require-trusted-types-for 'script'` reject a plain string passed to
   * `DOMParser`, so HTML import throws there unless the string is wrapped.
   * Pass a policy whose `createHTML` returns its input — the parsed document
   * is inert, and every node the editor builds from it is checked (URLs
   * included) before anything reaches the page:
   *
   * ```ts
   * const htmlPolicy = trustedTypes.createPolicy('teieditor', { createHTML: (s) => s });
   * deserialize(editor, html, 'html', { htmlPolicy });
   * ```
   */
  htmlPolicy?: HtmlPolicy;
}

/** The part of a Trusted Types policy HTML import needs. */
export interface HtmlPolicy {
  createHTML(input: string): unknown;
}

/**
 * Convenience: import content into an editor instance (no need to wrap in update).
 *
 * @example
 * ```ts
 * deserialize(editor, '# Hello\n\nWorld', 'markdown');
 * deserialize(editor, '<h1>Hello</h1>', 'html');
 * deserialize(editor, '{"root":...}', 'json');
 *
 * // Seed initial content without making it undoable:
 * deserialize(editor, '<p>Draft</p>', 'html', { tag: HISTORY_MERGE_TAG });
 * ```
 */
export function deserialize(
  editor: LexicalEditor,
  value: string,
  format: SerializationFormat,
  options: DeserializeOptions = {},
): void {
  const { tag, htmlPolicy } = options;

  if (format === 'json') {
    // JSON deserialization uses setEditorState, not update(). Its options bag
    // takes a single tag string rather than an array.
    const state = editor.parseEditorState(value);
    const setTag = Array.isArray(tag) ? tag[0] : tag;
    editor.setEditorState(state, setTag === undefined ? undefined : { tag: setTag });
    return;
  }

  editor.update(
    () => {
      $deserialize(value, format, editor, { htmlPolicy });
    },
    tag === undefined ? undefined : { tag },
  );
}
