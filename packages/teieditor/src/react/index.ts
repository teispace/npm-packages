/**
 * Drop-in React components for TeiEditor.
 *
 * Use this subpath when you want a fully-configured editor with zero setup.
 * For full customization (owning the UI source), use `npx teieditor init` instead.
 *
 * @example Minimal usage
 *   import { TeiEditor } from '@teispace/teieditor/react';
 *   import '@teispace/teieditor/styles.css';
 *
 *   <TeiEditor onChange={(html) => console.log(html)} />
 *
 * @example Notion-style (no toolbar)
 *   import { TeiEditorNotion } from '@teispace/teieditor/react';
 *
 *   <TeiEditorNotion initialValue="<p>Start writing...</p>" format="markdown" />
 */

// Commonly-needed types, re-exported so consumers only need one import path
// to type their extensions and onChange handlers.
export type { TeiEditorConfig, TeiExtension } from '../core/index.js';
export type { OutputFormat } from '../plugins/index.js';
export type { TeiEditorProps } from '../registry/editors/editor.js';
export { TeiEditor } from '../registry/editors/editor.js';
export type { TeiEditorNotionProps } from '../registry/editors/editor-notion.js';
export { TeiEditorNotion } from '../registry/editors/editor-notion.js';
export type { SerializationFormat } from '../utils/index.js';
