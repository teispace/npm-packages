import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  type MultilineElementTransformer,
  type Transformer,
} from '@lexical/markdown';
import {
  $createParagraphNode,
  $getEditor,
  type ElementNode,
  type Klass,
  type LexicalNode,
} from 'lexical';
import { TeiEditor } from '../core/editor.js';

/** The editor's markdown transformers, for a block's own content. */
function $transformers(): Transformer[] {
  try {
    return TeiEditor.of($getEditor())?.markdownTransformers ?? [];
  } catch {
    return [];
  }
}

export interface CommentFenceSpec<T extends ElementNode> {
  /** The fence's word: `card` for `<!-- card … -->` and `<!-- /card -->`. */
  name: string;
  dependencies: Array<Klass<LexicalNode>>;
  is: (node: LexicalNode | null | undefined) => node is T;
  /** The words after the name, saved: `['outlined', 'blue']`. */
  words: (node: T) => readonly string[];
  /** A node from the words read; each must be checked, they are the file's. */
  create: (words: readonly string[]) => T;
}

/**
 * A block that markdown has no syntax for, kept as HTML comments around
 * its own markdown: `<!-- card outlined -->`, the body, `<!-- /card -->`.
 * Other renderers show the body and hide the fence. Fences nest; one with
 * no end stays text.
 */
export function commentFence<T extends ElementNode>(
  spec: CommentFenceSpec<T>,
): MultilineElementTransformer {
  const start = new RegExp(`^<!--\\s*${spec.name}((?:\\s+[\\w-]+)*)\\s*-->\\s*$`, 'i');
  const end = new RegExp(`^<!--\\s*/${spec.name}\\s*-->\\s*$`, 'i');
  return {
    type: 'multiline-element',
    dependencies: spec.dependencies,
    regExpStart: start,
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
      let depth = 1;
      const body: string[] = [];
      let at = startLineIndex + 1;
      for (; at < lines.length; at++) {
        const line = lines[at] ?? '';
        if (start.test(line)) depth++;
        else if (end.test(line) && --depth === 0) break;
        body.push(line);
      }
      if (depth > 0) return null;
      const words = (startMatch[1] ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      const node = spec.create(words);
      node.append(...$generateNodesFromMarkdownString(body.join('\n'), $transformers()));
      if (node.isEmpty()) node.append($createParagraphNode());
      rootNode.append(node);
      return [true, at];
    },
    // Only read whole: typing a comment makes no block.
    replace: () => false,
    export: (node) => {
      if (!spec.is(node)) return null;
      const inner = $convertToMarkdownString($transformers(), node);
      const head = [spec.name, ...spec.words(node)].join(' ');
      return [`<!-- ${head} -->`, '', ...(inner ? [inner, ''] : []), `<!-- /${spec.name} -->`].join(
        '\n',
      );
    },
  };
}
