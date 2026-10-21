import type { TeiEditor } from '../core/editor.js';

/**
 * Editors whose right-click a `<ContextMenu>` handles: other parts with a
 * right-click of their own (the table's cell menu) step aside, whichever
 * loaded first.
 */
export const contextMenuOwners = new WeakSet<TeiEditor>();
