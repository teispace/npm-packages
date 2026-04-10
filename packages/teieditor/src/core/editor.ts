import { defaultTheme } from '../themes/default.js';
import type { TeiEditorConfig, TeiEditorInstance } from './types.js';

/**
 * Create a TeiEditor instance. Collects nodes, plugins and config from all
 * extensions and produces a ready-to-use Lexical composer configuration.
 *
 * @example
 * ```ts
 * const editor = createTeiEditor({
 *   extensions: [StarterKit, ImageExtension],
 * });
 * ```
 */
export function createTeiEditor(config: TeiEditorConfig): TeiEditorInstance {
  const {
    extensions,
    theme = defaultTheme,
    editable = true,
    namespace = 'TeiEditor',
    onError = defaultOnError,
  } = config;

  // Collect nodes and plugins from all extensions.
  const nodes = extensions.flatMap((ext) => ext.getNodes?.() ?? []);
  const plugins = extensions.flatMap((ext) => ext.getPlugins?.() ?? []);

  return {
    config,
    extensions,
    nodes,
    plugins,
    composerConfig: {
      namespace,
      theme,
      nodes,
      editable,
      onError,
    },
  };
}

function defaultOnError(error: Error): void {
  console.error('[TeiEditor]', error);
}
