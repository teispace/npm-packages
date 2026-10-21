import { buildEditorFromExtensions, KeyboardShortcutsExtension } from '@lexical/extension';
import {
  type AnyLexicalExtensionArgument,
  configExtension,
  defineExtension,
  type EditorThemeClasses,
  type LexicalEditor,
} from 'lexical';
import { getTeiEditor, type TeiCoreConfig, TeiCoreExtension } from './core-extension.js';
import { keymapToShortcuts } from './define.js';
import type { ContentFormat, TeiEditor } from './editor.js';
import type {
  TeiCommandMiddleware,
  TeiCommandSpec,
  TeiEvents,
  TeiIconNode,
  TeiItem,
  TeiKeyBinding,
} from './types.js';

/** An extension, an extension with options, or a preset (a list of them, nested freely). */
export type TeiExtensionInput =
  | AnyLexicalExtensionArgument
  | readonly TeiExtensionInput[]
  | false
  | null
  | undefined;

export interface TeiEditorOptions extends TeiEvents {
  /** The features. Presets are arrays and may be nested; falsy entries are skipped. */
  extensions: readonly TeiExtensionInput[];
  /** Initial content. A string is read as `contentFormat` (default HTML), an object as JSON. */
  content?: unknown;
  contentFormat?: ContentFormat;
  /** Start read-only with `false`. Default `true`. */
  editable?: boolean;
  /**
   * Editors with the same namespace copy and paste as Lexical JSON between
   * each other (lossless); otherwise HTML is used.
   */
  namespace?: string;
  /** Lexical theme classes, deep-merged over the extensions' own. */
  theme?: EditorThemeClasses;
  /** Called for errors inside updates. Default: log in production, throw in development. */
  onError?: (error: Error, lexical: LexicalEditor) => void;

  // App-level overrides. They apply after every extension, so they win.

  /** Add, replace (by name) or remove (`null`) commands. */
  commands?: Record<string, TeiCommandSpec | null>;
  /** Add, remap or disable (`null`) shortcuts by entry name. */
  keymap?: Record<string, TeiKeyBinding | null>;
  /** Add, replace or hide (`null`) UI items by id. */
  items?: Record<string, TeiItem | null>;
  /** Replace any UI string by id: translations, wording. */
  messages?: Record<string, string>;
  /** Replace any icon by name. */
  icons?: Record<string, TeiIconNode>;
  /** Wrap every command run. */
  middleware?: readonly TeiCommandMiddleware[];
}

/** Flatten presets and drop disabled entries, keeping Lexical's `[extension, config]` tuples whole. */
export function flattenExtensions(
  input: readonly TeiExtensionInput[],
): AnyLexicalExtensionArgument[] {
  const out: AnyLexicalExtensionArgument[] = [];
  const visit = (entry: TeiExtensionInput) => {
    if (!entry) return;
    if (Array.isArray(entry) && !isConfiguredExtension(entry)) {
      for (const item of entry as readonly TeiExtensionInput[]) visit(item);
      return;
    }
    out.push(entry as AnyLexicalExtensionArgument);
  };
  for (const entry of input) visit(entry);
  return out;
}

/** `configExtension()` returns `[extension, ...configs]`; a preset is an array of extensions. */
function isConfiguredExtension(entry: readonly unknown[]): boolean {
  const [first, ...rest] = entry;
  return (
    typeof first === 'object' &&
    first !== null &&
    !Array.isArray(first) &&
    'name' in first &&
    rest.every(
      (config) =>
        typeof config === 'object' &&
        config !== null &&
        !Array.isArray(config) &&
        !('name' in config),
    )
  );
}

let editorCount = 0;

function defaultOnError(error: Error): void {
  if (process.env.NODE_ENV !== 'production') throw error;
  console.error('[teieditor]', error);
}

/**
 * Build an editor outside React (or for tests and servers). In React, use
 * `useTeiEditor` or `<Editor>`, which call this for you.
 */
export function createTeiEditor(options: TeiEditorOptions): TeiEditor {
  const {
    extensions,
    content,
    contentFormat,
    editable = true,
    namespace = 'teieditor',
    theme,
    onError = defaultOnError,
    commands,
    keymap,
    items,
    messages,
    icons,
    middleware,
  } = options;

  const app: Partial<TeiCoreConfig> = { commands, items, messages, icons, middleware };
  const events: Record<string, unknown[]> = {};
  for (const name of [
    'onCreate',
    'onUpdate',
    'onSelectionUpdate',
    'onFocus',
    'onBlur',
    'onDestroy',
  ] as const) {
    if (options[name]) events[name] = [options[name]];
  }
  if (Object.keys(events).length) app.events = events;

  const root = defineExtension({
    name: `@teispace/teieditor/root-${++editorCount}`,
    namespace,
    editable,
    theme,
    onError,
    dependencies: [
      TeiCoreExtension,
      ...flattenExtensions(extensions),
      // Last, so the app's overrides win over every extension's.
      configExtension(TeiCoreExtension, app),
      ...(keymap
        ? [configExtension(KeyboardShortcutsExtension, { shortcuts: keymapToShortcuts(keymap) })]
        : []),
    ],
    $initialEditorState:
      content === undefined || content === null
        ? undefined
        : (lexical: LexicalEditor) => {
            const editor = getTeiEditor(lexical);
            editor.setContent(
              content,
              contentFormat ?? (typeof content === 'string' ? 'html' : 'json'),
              {
                tag: 'history-merge',
              },
            );
          },
  });

  return getTeiEditor(buildEditorFromExtensions(root));
}
