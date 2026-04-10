import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { createEditor, type Klass, type LexicalEditor, type LexicalNode } from 'lexical';

/**
 * Creates a minimal Lexical editor for testing node operations.
 * Must be used to wrap any code that creates or reads Lexical nodes.
 */
export function createTestEditor(extraNodes: Array<Klass<LexicalNode>> = []): LexicalEditor {
  return createEditor({
    namespace: 'test',
    theme: {},
    nodes: [HeadingNode, QuoteNode, ...extraNodes],
    onError: (error) => {
      throw error;
    },
  });
}

/**
 * Run a callback inside an editor.update() context.
 * Returns whatever the callback returns via a promise.
 */
export function withEditor<T>(editor: LexicalEditor, fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    editor.update(
      () => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        }
      },
      { discrete: true },
    );
  });
}
