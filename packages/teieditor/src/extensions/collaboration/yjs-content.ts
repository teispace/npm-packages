import {
  type Binding,
  createYjsBinding,
  type ExcludedProperties,
  type Provider,
  syncLexicalUpdateToYjs,
} from '@lexical/yjs';
import { $getRoot, type LexicalEditor, type SerializedEditorState } from 'lexical';
import { Doc, encodeStateAsUpdate } from 'yjs';
import { createShadowEditor } from '../../utils/shadow-editor.js';

export interface BindingShape {
  rootName: string;
  excludedProperties?: ExcludedProperties;
}

/** A provider that goes nowhere: what a binding needs to write without one. */
export const silentProvider = (): Provider => {
  const noop = () => {};
  return {
    awareness: {
      getLocalState: () => null,
      getStates: () => new Map(),
      on: noop,
      off: noop,
      setLocalState: noop,
      setLocalStateField: noop,
    },
    connect: noop,
    disconnect: noop,
    on: noop,
    off: noop,
  };
};

/**
 * Bring the whole of a Yjs document into the editor the binding is on, as
 * if every part of it had just arrived. Run inside an update. For a
 * document that already has content when the binding is made, which no
 * change event will ever announce.
 */
export function $loadFromYjs(binding: Binding): void {
  const root = binding.root;
  root.syncPropertiesFromYjs(binding, null);
  root.applyChildrenYjsDelta(binding, root._xmlText.toDelta());
  root.syncChildrenFromYjs(binding);
  root.syncSlotsFromYjs(binding, $getRoot());
}

/** 32-bit FNV-1a: the same text gives the same number everywhere. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Client id 0 means "nobody" to Lexical's cursors.
  return hash >>> 0 || 1;
}

/**
 * The Yjs update that writes `content` into an empty document, made the
 * same way on every client: in a document of its own whose client id is a
 * hash of the content. Two clients that seed the same document with the
 * same content make byte-identical updates, which Yjs merges into one copy
 * instead of two. Different content gets a different id, so it can never
 * collide with another seed.
 */
export function encodeSeed(
  source: LexicalEditor,
  content: SerializedEditorState,
  shape: BindingShape,
): Uint8Array {
  const doc = new Doc();
  doc.clientID = fnv1a(`${shape.rootName}\n${JSON.stringify(content)}`);
  const shadow = createShadowEditor(source);
  const binding = createYjsBinding({
    editor: shadow,
    id: 'seed',
    doc,
    docMap: new Map([['seed', doc]]),
    excludedProperties: shape.excludedProperties,
    rootName: shape.rootName,
  });
  const provider = silentProvider();
  const off = shadow.registerUpdateListener(
    ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) =>
      syncLexicalUpdateToYjs(
        binding,
        provider,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      ),
  );
  try {
    shadow.setEditorState(shadow.parseEditorState(content));
    return encodeStateAsUpdate(doc);
  } finally {
    off();
    binding.root.destroy(binding);
    doc.destroy();
  }
}

/** A Yjs document's content as Lexical JSON, read through a shadow of `source`. */
export function docToJSON(
  source: LexicalEditor,
  doc: Doc,
  shape: BindingShape,
): SerializedEditorState {
  const shadow = createShadowEditor(source);
  const binding = createYjsBinding({
    editor: shadow,
    id: 'read',
    doc,
    docMap: new Map([['read', doc]]),
    excludedProperties: shape.excludedProperties,
    rootName: shape.rootName,
  });
  try {
    shadow.update(() => $loadFromYjs(binding), { discrete: true });
    return shadow.getEditorState().toJSON();
  } finally {
    binding.root.destroy(binding);
  }
}
