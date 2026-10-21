/**
 * @teispace/teieditor — the core: build editors from extensions, run
 * commands, read and write content. Framework-free; React lives in
 * `@teispace/teieditor/react`, features in `@teispace/teieditor/extensions/*`.
 */

export type { TeiCoreConfig, TeiFormat } from './core/core-extension.js';
export { getTeiEditor, TeiCoreExtension } from './core/core-extension.js';
export type { TeiEditorOptions, TeiExtensionInput } from './core/create.js';
export { createTeiEditor, flattenExtensions } from './core/create.js';
export type {
  TeiExtension,
  TeiExtensionCommand,
  TeiExtensionContext,
  TeiExtensionOutput,
  TeiExtensionSpec,
} from './core/define.js';
export { defineTeiExtension, keymapToShortcuts, setExtensionOptions } from './core/define.js';
export type {
  ContentFormat,
  FocusPosition,
  TeiCan,
  TeiCanChain,
  TeiChain,
  TeiCommandRunner,
} from './core/editor.js';
export { TeiEditor } from './core/editor.js';
export { jsonFormat, textFormat } from './core/formats.js';
export { parseKey } from './core/keymap.js';
export type * from './core/types.js';
