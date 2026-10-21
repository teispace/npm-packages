/**
 * Saved content in, HTML, Markdown, text or JSON out, without a browser:
 * for server components, SSR, emails, feeds and search indexes. It runs the
 * same extensions and the same exporters as `editor.getHTML()` in the
 * browser, so a page rendered here matches what the editor shows.
 *
 * Needs `@lexical/headless` (an optional peer), which brings happy-dom for
 * the exporters that build DOM nodes.
 *
 * ```ts
 * import { renderToHTML } from '@teispace/teieditor/server';
 * import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
 *
 * const html = renderToHTML(post.body, { extensions: [StarterKit] });
 * ```
 */
import { HeadlessExtension } from '@lexical/headless';
import { withDOM } from '@lexical/headless/dom';
import { createTeiEditor, type TeiEditorOptions } from '../core/create.js';
import type { ContentFormat } from '../core/editor.js';

export interface ConvertOptions
  extends Pick<TeiEditorOptions, 'extensions' | 'namespace' | 'theme' | 'markdown'> {
  /** How `content` is written. Default: JSON for objects, HTML for strings. */
  from?: ContentFormat;
}

/**
 * Read `content` as `options.from` and write it as `to`. Content that does
 * not parse throws, as `setContent` does; nothing is half-converted.
 *
 * Synchronous on purpose: while it runs, a DOM is installed on `globalThis`
 * (when there is none already), and nothing else may run in between.
 */
export function convert(content: unknown, to: ContentFormat, options: ConvertOptions): unknown {
  const { from, extensions, ...rest } = options;
  return withDOM(() => {
    const editor = createTeiEditor({
      ...rest,
      extensions: [HeadlessExtension, ...extensions],
      content,
      contentFormat: from,
      editable: false,
      onError: (error) => {
        throw error;
      },
    });
    try {
      return editor.getContent(to);
    } finally {
      editor.destroy();
    }
  });
}

/** HTML for display: the same markup `editor.getHTML()` gives. */
export function renderToHTML(content: unknown, options: ConvertOptions): string {
  return convert(content, 'html', options) as string;
}

/** Markdown, through the installed extensions' transformers. */
export function toMarkdown(content: unknown, options: ConvertOptions): string {
  return convert(content, 'markdown', options) as string;
}

/** Plain text: for search indexes, previews and notifications. */
export function toText(content: unknown, options: ConvertOptions): string {
  return convert(content, 'text', options) as string;
}

/** Lexical JSON, from HTML or Markdown: for imports and migrations. */
export function toJSON(content: unknown, options: ConvertOptions): unknown {
  return convert(content, 'json', options);
}
