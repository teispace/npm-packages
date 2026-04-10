// Deprecated: BubbleMenu moved to registry. Kept for backward compatibility.

// Auto-embed (detect YouTube/Twitter/Figma URLs on paste)
export { AutoEmbedPlugin } from './auto-embed-plugin.js';
export { BubbleMenuPlugin, type BubbleMenuPluginProps } from './bubble-menu-plugin.js';
export { ClickableLinkPlugin } from './clickable-link-plugin.js';
// Code action menu (floating bar on code blocks)
export { CodeActionMenuPlugin } from './code-action-menu-plugin.js';
// Emoji picker (: trigger)
export { EmojiPickerPlugin } from './emoji-picker-plugin.js';
export { InitialValuePlugin, type InitialValuePluginProps } from './initial-value-plugin.js';
export { KeyboardShortcutsPlugin } from './keyboard-shortcuts-plugin.js';
export { OnChangePlugin, type OnChangePluginProps, type OutputFormat } from './on-change-plugin.js';
export { EditorContent, type EditorContentProps } from './rich-text-plugin.js';
export { TabIndentationPlugin } from './tab-indentation-plugin.js';
// Table plugins
export { TableCellResizerPlugin } from './table-cell-resizer-plugin.js';
export { TableHoverActionsPlugin } from './table-hover-actions-plugin.js';
// Toolbar context (shared state for toolbar, bubble menu, etc.)
export {
  type ToolbarActions,
  type ToolbarContextValue,
  ToolbarProvider,
  type ToolbarState,
  useToolbarState,
} from './toolbar-context.js';
