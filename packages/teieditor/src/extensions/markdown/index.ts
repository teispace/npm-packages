import { effect } from '@lexical/extension';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  registerMarkdownShortcuts,
} from '@lexical/markdown';
import { $createParagraphNode, $getRoot } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';

export interface MarkdownOptions {
  /** Turn markdown typed at the start of a line (`# `, `- `, `**bold**`) into formatting. Default true. */
  shortcuts: boolean;
  /** Keep single newlines as line breaks when reading markdown. Default false. */
  preserveNewLines: boolean;
}

/**
 * Markdown: the `markdown` content format (`getMarkdown()`,
 * `setContent(md, 'markdown')`) and shortcuts while typing. What it
 * understands is whatever the installed extensions registered — headings
 * when `Heading` is in, tables when `Table` is — so it never produces a
 * node the editor cannot hold.
 */
export const Markdown = defineTeiExtension({
  name: '@teispace/teieditor/markdown',
  config: { shortcuts: true, preserveNewLines: false } as MarkdownOptions,
  formats: {
    markdown: {
      parse: ({ editor }, value) => {
        if (typeof value !== 'string') {
          throw new TypeError('teieditor: markdown content must be a string');
        }
        const preserve: boolean =
          editor.extension(Markdown)?.output.options.preserveNewLines.value ?? false;
        $convertFromMarkdownString(value, editor.markdownTransformers, undefined, preserve);
        const root = $getRoot();
        if (root.getChildrenSize() === 0) root.append($createParagraphNode());
      },
      serialize: ({ editor }): string => {
        const preserve: boolean =
          editor.extension(Markdown)?.output.options.preserveNewLines.value ?? false;
        return $convertToMarkdownString(editor.markdownTransformers, undefined, preserve);
      },
    },
  },
  register: ({ editor, lexical, options }) =>
    effect(() =>
      options.shortcuts
        ? registerMarkdownShortcuts(lexical, editor.markdownTransformers)
        : undefined,
    ),
});
