import { defaultTheme } from '../themes/default.js';
import type { TeiEditorConfig, TeiEditorInstance, TeiNodeConfig } from './types.js';

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
    nodes: extraNodes,
    editorState,
    html,
  } = config;

  // Dedup by name, last-wins. Lets users pass `...StarterKit, FontFamily.configure(...)`
  // and have their configured version override the default — without filtering
  // the starter kit themselves.
  const seen = new Map<string, number>();
  rawExtensions.forEach((ext, i) => {
    seen.set(ext.name, i);
  });
  const extensions = rawExtensions.filter((ext, i) => seen.get(ext.name) === i);

  // Extension nodes first, then explicit `config.nodes` — so a node replacement
  // supplied by the caller is registered after the class it replaces.
  const nodes: Array<TeiNodeConfig> = [
    ...extensions.flatMap((ext) => ext.getNodes?.() ?? []),
    ...(extraNodes ?? []),
  ];
  const plugins = extensions.flatMap((ext) => ext.getPlugins?.() ?? []);

  const composerConfig: TeiEditorInstance['composerConfig'] = {
    namespace,
    theme,
    nodes,
    editable,
    onError,
  };

  // `editorState: null` is meaningful (it tells Lexical *not* to seed a default
  // paragraph, which the Yjs collaboration plugin requires), so test for
  // presence rather than truthiness. Absent stays absent.
  if ('editorState' in config) composerConfig.editorState = editorState;
  if (html !== undefined) composerConfig.html = html;

  return {
    config,
    extensions,
    nodes,
    plugins,
    composerConfig,
  };
}

function defaultOnError(error: Error): void {
  console.error('[TeiEditor]', error);
}
