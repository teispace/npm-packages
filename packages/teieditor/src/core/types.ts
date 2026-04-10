import type { EditorThemeClasses, Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';

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

  /** Lexical node classes this extension registers. */
  getNodes?(): Array<Klass<LexicalNode>>;

  /** React components mounted inside LexicalComposer (plugins). */
  getPlugins?(): Array<ComponentType>;

  /** Keyboard shortcuts: key combo → handler returning boolean. */
  getKeyBindings?(): Record<string, (editor: LexicalEditor) => boolean>;

  // -- Lifecycle ------------------------------------------------------------

  /** Called once when the editor mounts this extension. */
  onRegister?(editor: LexicalEditor): (() => void) | undefined;

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
}

/** The resolved editor instance returned by `createTeiEditor()`. */
export interface TeiEditorInstance {
  /** The config used to create this instance. */
  config: TeiEditorConfig;

  /** All registered extension instances. */
  extensions: TeiExtension[];

  /** Merged Lexical nodes from all extensions. */
  nodes: Array<Klass<LexicalNode>>;

  /** Merged React plugins from all extensions. */
  plugins: Array<ComponentType>;

  /** Lexical `InitialConfigType` ready for `<LexicalComposer>`. */
  composerConfig: {
    namespace: string;
    theme: EditorThemeClasses;
    nodes: Array<Klass<LexicalNode>>;
    editable: boolean;
    onError: (error: Error, editor: LexicalEditor) => void;
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
