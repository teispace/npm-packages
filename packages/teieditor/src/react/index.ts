/**
 * @teispace/teieditor/react — hooks and components for React.
 */

export { TeiEditorContext, useCurrentEditor, useOptionalEditor } from './context.js';
export type { ContentEditableProps, EditorContentProps } from './editor-content.js';
export { ContentEditable, EditorContent, EditorProvider } from './editor-content.js';
export type { UseEditorStateOptions } from './use-editor-state.js';
export { shallowEqual, useEditorState } from './use-editor-state.js';
export { createReactTeiEditor, useTeiEditor } from './use-tei-editor.js';
