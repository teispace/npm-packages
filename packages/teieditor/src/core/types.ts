import type {
  EditorState,
  EditorThemeClasses,
  HTMLConfig,
  Klass,
  LexicalEditor,
  LexicalNode,
  LexicalNodeReplacement,
} from 'lexical';
import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Lexical interop types
// ---------------------------------------------------------------------------

/**
 * A Lexical node class **or** a node-replacement descriptor
 * (`{ replace, with, withKlass }`).
 *
 * Mirrors Lexical's own `LexicalNodeConfig`. Accepting the replacement form
 * everywhere we accept nodes is what lets a consumer swap a core node — e.g.
 * substitute a custom `TextNode`/`ParagraphNode` subclass — without forking an
 * extension. See https://lexical.dev/docs/concepts/node-replacement
 */
export type TeiNodeConfig = Klass<LexicalNode> | LexicalNodeReplacement;

/**
 * Initial editor state accepted by `<LexicalComposer>`.
 *
 * `null` is the load-bearing value: it tells Lexical to skip seeding the root
 * with a default empty paragraph so an external owner — the Yjs collaboration
 * plugin — can populate it instead. Collaboration is unreachable without it.
 * See https://lexical.dev/docs/collaboration/react
 */
export type TeiInitialEditorState = null | string | EditorState | ((editor: LexicalEditor) => void);

/** Lexical's HTML import/export override map (`{ import?, export? }`). */
export type TeiHtmlConfig = HTMLConfig;

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

/** Configuration object passed to an extension's configure() method. */
export type ExtensionConfig = Record<string, unknown>;

/**
 * The building block of TeiEditor. Every feature (bold, image, table, …) is
 * an extension. Extensions declare the Lexical nodes they need, keyboard
 * shortcuts, React plugins, toolbar items and serialisation helpers.
 */
export interface TeiExtension<TConfig extends ExtensionConfig = ExtensionConfig> {
  /** Unique identifier, e.g. "bold", "image". */
  name: string;

  /** Current configuration (merged defaults + user overrides). */
  config: TConfig;

  /** Return a **new** extension instance with merged config. Immutable. */
  configure(config: Partial<TConfig>): TeiExtension<TConfig>;

  // -- Lexical integration --------------------------------------------------

  /**
   * Lexical node classes this extension registers. May also return
   * node-replacement descriptors (see {@link TeiNodeConfig}).
   */
  getNodes?(): Array<TeiNodeConfig>;

  /** React components mounted inside LexicalComposer (plugins). */
  getPlugins?(): Array<ComponentType>;

  /** Keyboard shortcuts: key combo → handler returning boolean. */
  getKeyBindings?(): Record<string, (editor: LexicalEditor) => boolean>;

  // -- Lifecycle ------------------------------------------------------------

  /** Called once when the editor mounts this extension. */
  onRegister?(editor: LexicalEditor): (() => void) | void;

  /** Called when the editor unmounts this extension. */
  onDestroy?(editor: LexicalEditor): void;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/** Options passed to `createTeiEditor()`. */
export interface TeiEditorConfig {
  /** Extensions to activate. */
  extensions: TeiExtension[];

  /** Lexical theme overrides. */
  theme?: EditorThemeClasses;

  /** Whether the editor is read-only. */
  editable?: boolean;

  /** Lexical namespace (used for DOM identification). */
  namespace?: string;

  /** Called when Lexical encounters an unrecoverable error. */
  onError?: (error: Error, editor: LexicalEditor) => void;

  /**
   * Extra Lexical nodes (or node replacements) appended after every
   * extension-contributed node. Use this to override a core node such as
   * `TextNode` or `ParagraphNode` without writing an extension:
   *
   * ```ts
   * createTeiEditor({
   *   extensions: StarterKit,
   *   nodes: [MyTextNode, { replace: TextNode, with: (n) => new MyTextNode(n.__text), withKlass: MyTextNode }],
   * });
   * ```
   */
  nodes?: Array<TeiNodeConfig>;

  /**
   * Initial editor state, passed straight through to `<LexicalComposer>`.
   *
   * Pass `null` when pairing the editor with the Yjs collaboration plugin so
   * that the collaborative document — not Lexical — owns the initial content.
   * Omitting the field keeps Lexical's default (seed an empty paragraph).
   */
  editorState?: TeiInitialEditorState;

  /**
   * HTML import/export overrides, passed straight through to
   * `<LexicalComposer>`. Lets you customise `$generateNodesFromDOM` /
   * `$generateHtmlFromNodes` behaviour without subclassing nodes.
   */
  html?: TeiHtmlConfig;
}

/** The resolved editor instance returned by `createTeiEditor()`. */
export interface TeiEditorInstance {
  /** The config used to create this instance. */
  config: TeiEditorConfig;

  /** All registered extension instances. */
  extensions: TeiExtension[];

  /** Merged Lexical nodes from all extensions, plus `config.nodes`. */
  nodes: Array<TeiNodeConfig>;

  /** Merged React plugins from all extensions. */
  plugins: Array<ComponentType>;

  /**
   * Lexical `InitialConfigType` ready for `<LexicalComposer>`.
   *
   * `editorState` and `html` are only present when the corresponding
   * `TeiEditorConfig` field was supplied — passing them through as `undefined`
   * would be indistinguishable from omitting them, but keeping the key absent
   * makes the intent obvious when the object is inspected or snapshotted.
   */
  composerConfig: {
    namespace: string;
    theme: EditorThemeClasses;
    nodes: Array<TeiNodeConfig>;
    editable: boolean;
    onError: (error: Error, editor: LexicalEditor) => void;
    editorState?: TeiInitialEditorState;
    html?: TeiHtmlConfig;
  };
}

// ---------------------------------------------------------------------------
// Toolbar (used by registry UI components)
// ---------------------------------------------------------------------------

export interface ToolbarItem {
  /** Unique key. */
  name: string;
  /** Icon component. */
  icon?: ComponentType<{ className?: string }>;
  /** Tooltip / aria-label. */
  label: string;
  /** Whether the format is currently active. */
  isActive?: (editor: LexicalEditor) => boolean;
  /** Execute the command. */
  action: (editor: LexicalEditor) => void;
  /** Keyboard shortcut label for tooltip, e.g. "Ctrl+B". */
  shortcut?: string;
}

export interface ToolbarGroup {
  name: string;
  items: ToolbarItem[];
}
