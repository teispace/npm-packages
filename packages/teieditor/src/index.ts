// Core

export type {
  ExtensionConfig,
  TeiEditorConfig,
  TeiEditorInstance,
  TeiExtension,
  ToolbarGroup,
  ToolbarItem,
} from './core/index.js';
export { BaseExtension, createTeiEditor, TeiEditorProvider, useTeiEditor } from './core/index.js';

// Extensions (re-export everything from the extensions barrel)
export * from './extensions/index.js';
export type {
  BubbleMenuPluginProps,
  EditorContentProps,
  InitialValuePluginProps,
  OnChangePluginProps,
  OutputFormat,
} from './plugins/index.js';
// Plugins
export {
  BubbleMenuPlugin,
  EditorContent,
  InitialValuePlugin,
  KeyboardShortcutsPlugin,
  OnChangePlugin,
} from './plugins/index.js';

// Themes
export { defaultTheme } from './themes/index.js';

// Serialization utilities
export {
  $deserialize,
  $serialize,
  deserialize,
  type SerializationFormat,
  serialize,
} from './utils/index.js';
