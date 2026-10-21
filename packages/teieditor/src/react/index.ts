/**
 * @teispace/teieditor/react — hooks and components for React.
 */

export { TeiEditorContext, useCurrentEditor, useOptionalEditor } from './context.js';
export type { ContentEditableProps, EditorContentProps } from './editor-content.js';
export { ContentEditable, EditorContent, EditorProvider } from './editor-content.js';
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
export type { UseEditorStateOptions } from './use-editor-state.js';
export { shallowEqual, useEditorState } from './use-editor-state.js';
export { createReactTeiEditor, useTeiEditor } from './use-tei-editor.js';
