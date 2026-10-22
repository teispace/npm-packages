/**
 * @teispace/teieditor/react — hooks and components for React.
 */

export type { BlockHandleProps } from './components/block-handle.js';
export { BlockHandle } from './components/block-handle.js';
export type { BubbleMenuProps } from './components/bubble-menu.js';
export { BubbleMenu } from './components/bubble-menu.js';
export type { CalloutMenuProps } from './components/callout-menu.js';
export { CalloutMenu } from './components/callout-menu.js';
// Ready-made UI, built from what the installed extensions contribute.
export type { CodeBlockBarProps } from './components/code-block-bar.js';
export { CodeBlockBar } from './components/code-block-bar.js';
export type { ColumnsMenuProps } from './components/columns-menu.js';
export { ColumnsMenu } from './components/columns-menu.js';
export type { ContextMenuProps } from './components/context-menu.js';
export { ContextMenu } from './components/context-menu.js';
export type { DateTimePickerProps } from './components/date-time-picker.js';
export { DateTimePicker } from './components/date-time-picker.js';
export type { DocumentMenuProps } from './components/document-menu.js';
export { DocumentMenu } from './components/document-menu.js';
export type { EditorProps, EditorSlot, EditorSlots } from './components/editor.js';
export { Editor } from './components/editor.js';
export type {
  EditorToolbarProps,
  ToolbarControl,
  ToolbarEntry,
  ToolbarLayout,
  ToolbarSubmenu,
} from './components/editor-toolbar.js';
export {
  AlignMenu,
  BlockTypeMenu,
  EditorToolbar,
  ItemButton,
  ItemMenu,
} from './components/editor-toolbar.js';
export type { EmbedControlsProps } from './components/embed-controls.js';
export {
  EmbedControls,
  EmbedInsertPopover,
  EmbedSuggestionMenu,
  InsertEmbedForm,
} from './components/embed-controls.js';
export type { EmojiPanelProps, EmojiPickerProps } from './components/emoji-picker.js';
export { EmojiPanel, EmojiPicker } from './components/emoji-picker.js';
export type { FileControlsProps } from './components/file-controls.js';
export { FileControls } from './components/file-controls.js';
export type { FindReplaceBarProps } from './components/find-replace-bar.js';
export { FindReplaceBar } from './components/find-replace-bar.js';
export type { ImageControlsProps } from './components/image-controls.js';
export { ImageControls } from './components/image-controls.js';
export { ImageInsertPopover, InsertImageForm, InsertImageMenu } from './components/image-insert.js';
export type { LinkPopoverProps } from './components/link-popover.js';
export { LinkPopover } from './components/link-popover.js';
export { NodeToolbar, PlacementItems } from './components/node-toolbar.js';
export type { RubyPopoverProps } from './components/ruby-popover.js';
export { RubyPopover } from './components/ruby-popover.js';
export type { SlashMenuProps } from './components/slash-menu.js';
export { rankSlashItem, SlashMenu } from './components/slash-menu.js';
export type { StickyMenuProps } from './components/sticky-menu.js';
export { StickyMenu } from './components/sticky-menu.js';
export type { TableControlsProps } from './components/table-controls.js';
export { TableControls } from './components/table-controls.js';
export { InsertTableMenu } from './components/table-insert.js';
export type { TableOfContentsPanelProps } from './components/table-of-contents.js';
export { TableOfContentsPanel, useOutline } from './components/table-of-contents.js';
export type { TypeaheadMenuProps } from './components/typeahead-menu.js';
export { TypeaheadMenu } from './components/typeahead-menu.js';
export type { LimitState, WordCountProps, WordCountStat } from './components/word-count.js';
export { limitState, WordCount } from './components/word-count.js';
export { TeiEditorContext, useCurrentEditor, useOptionalEditor } from './context.js';
export type { ContentEditableProps, EditorContentProps } from './editor-content.js';
export { ContentEditable, EditorContent, EditorProvider } from './editor-content.js';
export type { ItemState } from './items.js';
export { itemText, readItemState, useItemStates } from './items.js';
export { rangeAnchor, selectionAnchor } from './selection-anchor.js';
// UI primitives: what the built-in UI is made of, exported for custom UI.
export type { ButtonProps } from './ui/button.js';
export { Button } from './ui/button.js';
export type { TeiIconLike, TeiPart, TeiUIConfig } from './ui/context.js';
export { cx, TeiUIContext, usePartClass, useTeiUI } from './ui/context.js';
export type {
  ColorPickerProps,
  ColorSwatch,
  GridPickerProps,
  NumberStepperProps,
  SwitchProps,
} from './ui/controls.js';
export {
  ColorPicker,
  Field,
  GridPicker,
  Input,
  NumberStepper,
  Select,
  Switch,
} from './ui/controls.js';
export type { DialogProps } from './ui/dialog.js';
export { Dialog } from './ui/dialog.js';
export type { DropdownMenuProps } from './ui/dropdown.js';
export { DropdownMenu } from './ui/dropdown.js';
export type { FloatingAnchor, FloatingOptions, Placement, VirtualElement } from './ui/floating.js';
export { positionFloating, useFloating } from './ui/floating.js';
export type { IconProps } from './ui/icon.js';
export { Icon, renderIconNode } from './ui/icon.js';
export type {
  MenuGroupData,
  MenuItemData,
  MenuNavigation,
  MenuNavigationOptions,
  MenuProps,
} from './ui/menu.js';
export { Menu, useMenuNavigation } from './ui/menu.js';
export type { DismissReason, PopoverProps } from './ui/popover.js';
export { Popover } from './ui/popover.js';
export type { ToolbarProps } from './ui/toolbar.js';
export { Separator, Toolbar } from './ui/toolbar.js';
export { hideTooltip, showTooltip } from './ui/tooltip.js';
export { useEditorFocus } from './use-editor-focus.js';
export type { UseEditorStateOptions } from './use-editor-state.js';
export { shallowEqual, useEditorState } from './use-editor-state.js';
export { useSignal } from './use-signal.js';
export { createReactTeiEditor, useTeiEditor } from './use-tei-editor.js';
export { useUiRequest } from './use-ui-request.js';
