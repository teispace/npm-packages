import type { TeiEditor } from '../../src/core/editor';
import { CharacterCount } from '../../src/extensions/character-count/index';
import { TableOfContents } from '../../src/extensions/table-of-contents/index';
import { TableOfContentsPanel, WordCount } from '../../src/react/index';

/** The `doctools` flag: a table of contents and counts; `doctools-limit` sets a limit of 10 characters. */
export const documentTools = (params: URLSearchParams) =>
  params.has('doctools')
    ? [
        TableOfContents,
        CharacterCount.configure({
          countSelection: true,
          limit: params.has('doctools-limit') ? 10 : null,
        }),
      ]
    : [];

/** The side panel and the count line, outside the editor's frame. */
export function DocumentTools({ editor }: { editor: TeiEditor }) {
  return (
    <>
      <WordCount editor={editor} data-testid="word-count" />
      <TableOfContentsPanel editor={editor} data-testid="toc-panel" />
    </>
  );
}
