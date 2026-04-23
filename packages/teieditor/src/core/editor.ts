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
    extensions: rawExtensions,
    theme = defaultTheme,
    editable = true,
    namespace = 'TeiEditor',
    onError = defaultOnError,
  } = config;

  // Dedup by name, last-wins. Lets users pass `...StarterKit, FontFamily.configure(...)`
  // and have their configured version override the default — without filtering
  // the starter kit themselves.
  const seen = new Map<string, number>();
  rawExtensions.forEach((ext, i) => {
    seen.set(ext.name, i);
  });
  const extensions = rawExtensions.filter((ext, i) => seen.get(ext.name) === i);

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
