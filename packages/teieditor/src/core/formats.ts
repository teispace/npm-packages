import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $parseSerializedNode,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from 'lexical';
import type { TeiFormat } from './core-extension.js';

/**
 * Lexical's own JSON: `editor.getJSON()` and back. Accepts the object or
 * its string form. Content that does not parse is refused whole rather than
 * half-applied.
 */
export const jsonFormat: TeiFormat = {
  parse(_ctx, value) {
    const state = (typeof value === 'string' ? JSON.parse(value) : value) as
      | SerializedEditorState
      | { root?: undefined };
    const children = state?.root?.children;
    if (!Array.isArray(children)) {
      throw new Error('teieditor: JSON content needs a { root: { children: [...] } } object');
    }
    // Parse every node before touching the document, so a bad node in the
    // middle leaves the current content as it was.
    const nodes = children.map((child: SerializedLexicalNode) => $parseSerializedNode(child));
    const root = $getRoot().clear();
    if (nodes.length) root.append(...nodes);
    else root.append($createParagraphNode());
  },
  serialize: ({ editor }) => editor.getJSON(),
};

/** Plain text: one paragraph per line in, the document's text content out. */
export const textFormat: TeiFormat = {
  parse(_ctx, value) {
    const lines = String(value ?? '').split(/\r\n|\r|\n/);
    $getRoot()
      .clear()
      .append(
        ...lines.map((line) => {
          const paragraph = $createParagraphNode();
          if (line) paragraph.append($createTextNode(line));
          return paragraph;
        }),
      );
  },
  serialize: () => $getRoot().getTextContent(),
};
