import { createEditor, type LexicalEditor } from 'lexical';

/**
 * A bare Lexical editor that knows the same nodes and theme as `source`,
 * with none of its extensions: for content kept apart from the document
 * (a version's preview, a conversion). It reads and writes Lexical JSON
 * like the source does; errors throw to the caller.
 */
export function createShadowEditor(
  source: LexicalEditor,
  { editable = false }: { editable?: boolean } = {},
): LexicalEditor {
  return createEditor({
    namespace: source._config.namespace,
    nodes: Array.from(source._nodes.values(), (registered) => registered.klass),
    theme: source._config.theme,
    editable,
    onError: (error) => {
      throw error;
    },
  });
}
