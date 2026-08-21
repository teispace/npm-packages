// Core

export type {
  ExtensionConfig,
  TeiChromeSlot,
  TeiEditorConfig,
  TeiEditorInstance,
  TeiEditorSlotProps,
  TeiExtension,
  TeiHtmlConfig,
  TeiInitialEditorState,
  TeiNodeConfig,
  ToolbarGroup,
  ToolbarItem,
} from './core/index.js';
export {
  BaseExtension,
  createTeiEditor,
  TeiEditorProvider,
  TeiEditorSlot,
  useTeiChromeSlot,
  useTeiEditor,
} from './core/index.js';

// Extensions (re-export everything from the extensions barrel)
export * from './extensions/index.js';

// Plugins
export type {
  BubbleMenuPluginProps,
  EditorContentProps,
  InitialValuePluginProps,
  OnChangePluginProps,
  OutputFormat,
  ToolbarActions,
  ToolbarContextValue,
  ToolbarState,
} from './plugins/index.js';
export {
  AutoEmbedPlugin,
  BubbleMenuPlugin,
  ClickableLinkPlugin,
  CodeActionMenuPlugin,
  EditorContent,
  EmojiPickerPlugin,
  InitialValuePlugin,
  KeyboardShortcutsPlugin,
  OnChangePlugin,
  TabIndentationPlugin,
  TableCellResizerPlugin,
  TableHoverActionsPlugin,
  ToolbarProvider,
  useToolbarState,
} from './plugins/index.js';

// Themes
export { defaultTheme } from './themes/index.js';

// Serialization utilities
export {
  $deserialize,
  $serialize,
  type DeserializeOptions,
  deserialize,
  type SerializationFormat,
  serialize,
} from './utils/index.js';
