import {
  batch,
  effect,
  getPeerDependencyFromEditor,
  type ReadonlySignal,
  type Signal,
  signal,
} from '@lexical/extension';
import {
  type Binding,
  createYjsBinding,
  type ExcludedProperties,
  initLocalState,
  type Provider,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from '@lexical/yjs';
import {
  $getRoot,
  BLUR_COMMAND,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  declarePeerDependency,
  FOCUS_COMMAND,
  getActiveElement,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  mergeRegister,
  REDO_COMMAND,
  type SerializedEditorState,
  SKIP_COLLAB_TAG,
  UNDO_COMMAND,
} from 'lexical';
import {
  applyUpdate,
  createDocFromSnapshot,
  type Doc,
  decodeSnapshot,
  encodeSnapshot,
  type Transaction,
  snapshot as takeSnapshot,
  UndoManager,
  type Array as YArray,
  type YEvent,
} from 'yjs';
import { defineTeiExtension } from '../../core/define.js';
import type { ContentFormat, TeiEditor } from '../../core/editor.js';
import { redo, undo } from '../../icons/index.js';
import { $loadFromYjs, docToJSON, encodeSeed } from './yjs-content.js';

export type { Provider, ProviderAwareness, UserState } from '@lexical/yjs';
export {
  BroadcastProvider,
  type BroadcastProviderOptions,
  type ChannelLike,
  createBroadcastProvider,
} from './broadcast-provider.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    undo: [];
    redo: [];
    /** Connect to the provider (again). */
    connect: [];
    /** Stop syncing; edits stay local until `connect`. */
    disconnect: [];
  }
}

/** Builds the provider for a document id, putting the Y.Doc it syncs in `docMap`. */
export type ProviderFactory = (id: string, docMap: Map<string, Doc>) => Provider;

export interface CollaborationUser {
  /** Shown on this user's cursor and in the others' presence list. */
  name: string;
  /** Any CSS colour: this user's cursor and selection. */
  color: string;
}

export interface CollaborationOptions {
  /** The document's id: what a provider factory connects to. Default `'main'`. */
  id: string;
  /**
   * The Yjs document. May be left out with a provider factory, which puts
   * one in `docMap` under `id`.
   */
  doc: Doc | null;
  /** Documents by id, shared with the factory. Default: a new map per editor. */
  docMap: Map<string, Doc> | null;
  /**
   * The provider (y-websocket, Hocuspocus, `createBroadcastProvider`, …),
   * or a factory that makes one for `(id, docMap)`. Anything with
   * @lexical/yjs's Provider interface.
   */
  provider: Provider | ProviderFactory | null;
  /** Who this is; the colour defaults to one picked by client id. */
  user: Partial<CollaborationUser>;
  /** More presence data for the others, under `awarenessData`. */
  awarenessData: object;
  /**
   * Write the editor's starting content into the shared document when it
   * is still empty after the first sync. Safe on every client: seeds of
   * the same content are identical, so Yjs keeps one. Default true.
   */
  shouldBootstrap: boolean;
  /**
   * What an empty shared document starts with. Default: the editor's own
   * `content`. Set this, not `content`, for HTML in React (which goes in
   * after mount, too late to seed).
   */
  initialContent: unknown;
  initialContentFormat: ContentFormat | undefined;
  /**
   * Where remote cursors are drawn. Default: a layer beside the editable
   * root. Positions are measured from this element's offset parent.
   */
  cursorsContainer: HTMLElement | ((root: HTMLElement) => HTMLElement | null) | null;
  /** The shared type's name in the Y.Doc. Default `'root'`. */
  rootName: string;
  /** Node properties kept out of the shared document, by node class. */
  excludedProperties: ExcludedProperties | undefined;
  /** Edits within this many ms are one undo step. Default 500. */
  undoDelay: number;
  /** Draw remote selections with the CSS Custom Highlight API where supported. Default false. */
  selectionHighlight: boolean;
  /** Connect when the editor starts. Default true. */
  connect: boolean;
}

export type CollaborationStatus = 'connecting' | 'connected' | 'disconnected';

/** Someone else in the document, from their awareness state. */
export interface CollaborationPeer {
  /** Their Yjs client id. */
  clientId: number;
  name: string;
  color: string;
  /** Whether their cursor is in the document. */
  focusing: boolean;
  /** What they put in `awarenessData`. */
  data: object;
}

/** A version of the shared document, as a Yjs snapshot. */
export interface CollaborationSnapshot {
  /** The snapshot, base64. */
  snapshot: string;
}

/** A list kept in the shared document, for every client to see. */
export interface SharedList<T extends { id: string }> {
  get(): T[];
  push(item: T): void;
  remove(id: string): void;
  update(id: string, patch: Partial<T>): void;
  /** Called after any client changes the list; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export interface CollaborationStorage {
  readonly status: ReadonlySignal<CollaborationStatus>;
  /** Whether the provider has synced with the others at least since the last connect. */
  readonly synced: ReadonlySignal<boolean>;
  /** The others in the document, in client-id order. */
  readonly peers: ReadonlySignal<readonly CollaborationPeer[]>;
  /** This client: its id and how it shows to the others. */
  readonly self: ReadonlySignal<CollaborationPeer | null>;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  /** The live parts, once the editor has started (a microtask after it is built). */
  readonly doc: Doc | null;
  readonly provider: Provider | null;
  readonly binding: Binding | null;
  readonly undoManager: UndoManager | null;
  connect(): void;
  disconnect(): void;
  /** End the current undo step: the next edit starts a new one. */
  stopCapturing(): void;
  /**
   * A snapshot of the document now, or `null` where it could not be
   * restored later: Yjs keeps what a snapshot needs only with `gc: false`.
   */
  snapshot(): CollaborationSnapshot | null;
  /** A snapshot's document as Lexical JSON. */
  snapshotToJSON(snapshot: CollaborationSnapshot): SerializedEditorState;
  /** A list of plain objects kept in the shared document under `name`. */
  sharedList<T extends { id: string }>(name: string): SharedList<T>;
}

/** Cursor colours for users who did not choose one: legible on light and dark. */
export const COLLABORATION_COLORS: readonly string[] = [
  '#e5484d',
  '#f76b15',
  '#d6a600',
  '#30a46c',
  '#12a594',
  '#0090ff',
  '#6e56cf',
  '#d6409f',
];

/** Origin of the seed's transaction: no client's undo step. */
const SEED_ORIGIN = Symbol('teieditor-seed');
/** Where tooling finds the UndoManager, as Lexical's React plugin publishes it. */
const COLLAB_UNDO_MANAGER = Symbol.for('@lexical/yjs/UndoManager');

const isFactory = (value: CollaborationOptions['provider']): value is ProviderFactory =>
  typeof value === 'function';

const toBase64 = (bytes: Uint8Array) => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

type Writable<S> = { -readonly [K in keyof S]: S[K] };
interface MutableStorage extends Writable<CollaborationStorage> {
  status: Signal<CollaborationStatus>;
  synced: Signal<boolean>;
  peers: Signal<readonly CollaborationPeer[]>;
  self: Signal<CollaborationPeer | null>;
  canUndo: Signal<boolean>;
  canRedo: Signal<boolean>;
}

const notStarted = () => {
  throw new Error('teieditor: collaboration has not started yet');
};

/**
 * Real-time collaboration over Yjs: the document lives in a shared Y.Doc
 * that a provider syncs, with the others' cursors and selections drawn in
 * their colours and names, and undo that takes back only this user's own
 * edits (Yjs's UndoManager).
 *
 * It replaces History: when both are installed, collaboration's undo and
 * redo win, and Lexical's local history is switched off (it would undo
 * the others' edits too). Leave History out (`StarterKit.configure({
 * history: false })`) to save its bytes.
 *
 * ```ts
 * const doc = new Y.Doc();
 * Collaboration.configure({
 *   doc,
 *   provider: createBroadcastProvider('my-room', doc),
 *   user: { name: 'Ada', color: '#0090ff' },
 * });
 * ```
 *
 * The editor starts a microtask after it is built: the shared document's
 * content replaces the editor's, or, when it is empty after the first
 * sync, the editor's starting content (or `initialContent`) seeds it.
 */
export const Collaboration = defineTeiExtension({
  name: '@teispace/teieditor/collaboration',
  config: {
    id: 'main',
    doc: null,
    docMap: null,
    provider: null,
    user: {},
    awarenessData: {},
    shouldBootstrap: true,
    initialContent: undefined,
    initialContentFormat: undefined,
    cursorsContainer: null,
    rootName: 'root',
    excludedProperties: undefined,
    undoDelay: 500,
    selectionHighlight: false,
    connect: true,
  } as CollaborationOptions,
  // History, when installed, comes first: so this one's undo and redo
  // replace its own, and its local history is off.
  peerDependencies: [
    declarePeerDependency('@teispace/teieditor/history'),
    declarePeerDependency<typeof import('@lexical/history').HistoryExtension>(
      '@lexical/history/History',
      { disabled: true },
    ),
  ],
  theme: {
    collaboration: {
      cursor: 'tei-collab-caret',
      cursorName: 'tei-collab-name',
      selection: 'tei-collab-selection',
      selectionBg: 'tei-collab-selection-bg',
    },
  },
  storage: (): CollaborationStorage => {
    const storage: MutableStorage = {
      status: signal<CollaborationStatus>('disconnected'),
      synced: signal(false),
      peers: signal<readonly CollaborationPeer[]>([]),
      self: signal<CollaborationPeer | null>(null),
      canUndo: signal(false),
      canRedo: signal(false),
      doc: null,
      provider: null,
      binding: null,
      undoManager: null,
      connect: notStarted,
      disconnect: notStarted,
      stopCapturing: () => storage.undoManager?.stopCapturing(),
      snapshot: notStarted,
      snapshotToJSON: notStarted,
      sharedList: notStarted,
    };
    return storage;
  },
  commands: {
    undo: {
      run: ({ lexical }) => lexical.dispatchCommand(UNDO_COMMAND, undefined),
      can: ({ storage }) => storage.canUndo.peek(),
    },
    redo: {
      run: ({ lexical }) => lexical.dispatchCommand(REDO_COMMAND, undefined),
      can: ({ storage }) => storage.canRedo.peek(),
    },
    connect: {
      run: ({ storage }) => {
        if (storage.status.peek() !== 'disconnected' || !storage.provider) return false;
        storage.connect();
        return true;
      },
      can: ({ storage }) => storage.status.peek() === 'disconnected' && !!storage.provider,
    },
    disconnect: {
      run: ({ storage }) => {
        if (storage.status.peek() === 'disconnected') return false;
        storage.disconnect();
        return true;
      },
      can: ({ storage }) => storage.status.peek() !== 'disconnected',
    },
  },
  keymap: {
    undo: { key: 'Mod-z', command: 'undo', description: 'Undo' },
    redo: { key: ['Mod-Shift-z', 'Ctrl-y'], command: 'redo', description: 'Redo' },
  },
  icons: { undo, redo },
  messages: {
    'history.undo': 'Undo',
    'history.redo': 'Redo',
    'collaboration.label': 'Collaborators',
    'collaboration.anonymous': 'Anonymous',
    'collaboration.you': '{name} (you)',
    'collaboration.status.connecting': 'Connecting…',
    'collaboration.status.connected': 'Connected',
    'collaboration.status.disconnected': 'Offline',
    'collaboration.status.syncing': 'Syncing…',
    'collaboration.peers.one': '{count} other person here',
    'collaboration.peers.other': '{count} other people here',
    'collaboration.alone': 'Only you here',
    'collaboration.more': '{count} more',
    'collaboration.connect': 'Reconnect',
    'collaboration.disconnect': 'Go offline',
  },
  items: [
    {
      id: 'undo',
      label: 'history.undo',
      icon: 'undo',
      in: ['toolbar'],
      group: 'history',
      order: 0,
      shortcut: 'undo',
      command: 'undo',
    },
    {
      id: 'redo',
      label: 'history.redo',
      icon: 'redo',
      in: ['toolbar'],
      group: 'history',
      order: 1,
      shortcut: 'redo',
      command: 'redo',
    },
  ],
  register: ({ editor, lexical, options, storage }) => {
    const store = storage as MutableStorage;
    const source = options.provider;
    if (!source) {
      throw new Error(
        'teieditor: Collaboration needs a `provider` (or a provider factory). ' +
          'For tabs of one browser: createBroadcastProvider(room, doc).',
      );
    }
    const id = options.id;
    const docMap = options.docMap ?? new Map<string, Doc>();
    if (options.doc && !docMap.has(id)) docMap.set(id, options.doc);
    const provider = isFactory(source) ? source(id, docMap) : source;
    const doc = docMap.get(id) ?? options.doc;
    if (!doc) {
      throw new Error(
        `teieditor: Collaboration has no Y.Doc for "${id}": pass \`doc\`, or have the provider factory put one in \`docMap\`.`,
      );
    }
    docMap.set(id, doc);
    const shape = { rootName: options.rootName, excludedProperties: options.excludedProperties };
    const binding = createYjsBinding({
      editor: lexical,
      id,
      doc,
      docMap,
      excludedProperties: shape.excludedProperties,
      rootName: shape.rootName,
    });
    const shared = binding.root.getSharedType();
    const undoManager = new UndoManager(shared, {
      captureTimeout: options.undoDelay,
      // Seeding is no one's edit (Lexical's own bootstrap flag too).
      captureTransaction: () => !binding.isBootstrapping,
      trackedOrigins: new Set([binding, null]),
    });

    const user = (): CollaborationUser => {
      const chosen = options.user;
      return {
        name: chosen?.name || editor.t('collaboration.anonymous'),
        color:
          chosen?.color ||
          (COLLABORATION_COLORS[doc.clientID % COLLABORATION_COLORS.length] as string),
      };
    };

    Object.assign(store, {
      doc,
      provider,
      binding,
      undoManager,
      snapshot: (): CollaborationSnapshot | null =>
        doc.gc ? null : { snapshot: toBase64(encodeSnapshot(takeSnapshot(doc))) },
      snapshotToJSON: ({ snapshot }: CollaborationSnapshot) => {
        const past = createDocFromSnapshot(doc, decodeSnapshot(fromBase64(snapshot)));
        try {
          return docToJSON(lexical, past, shape);
        } finally {
          past.destroy();
        }
      },
      sharedList: <T extends { id: string }>(name: string) => sharedList<T>(doc, name),
    });
    (lexical as LexicalEditor & Record<symbol, unknown>)[COLLAB_UNDO_MANAGER] = undoManager;

    // -- Undo, only this user's ------------------------------------------------
    const undoState = () =>
      batch(() => {
        store.canUndo.value = undoManager.undoStack.length > 0;
        store.canRedo.value = undoManager.redoStack.length > 0;
      });
    undoManager.on('stack-item-added', undoState);
    undoManager.on('stack-item-popped', undoState);
    undoManager.on('stack-cleared', undoState);

    // -- Presence ---------------------------------------------------------------
    const syncCursors = (b: Parameters<typeof syncCursorPositions>[0], p: Provider) =>
      syncCursorPositions(b, p, { selectionHighlight: options.selectionHighlight });
    const readPeers = () => {
      const peers: CollaborationPeer[] = [];
      let self: CollaborationPeer | null = null;
      const states = [...provider.awareness.getStates()].sort(([a], [b]) => a - b);
      for (const [clientId, state] of states) {
        if (!state || typeof state.name !== 'string') continue;
        const peer: CollaborationPeer = {
          clientId,
          name: state.name,
          color: typeof state.color === 'string' ? state.color : '',
          focusing: Boolean(state.focusing),
          data: (state.awarenessData as object | undefined) ?? {},
        };
        if (clientId === doc.clientID) self = peer;
        else peers.push(peer);
      }
      batch(() => {
        store.peers.value = peers;
        store.self.value = self;
      });
    };
    const onAwareness = () => {
      syncCursors(binding, provider);
      readPeers();
    };
    const focused = () => {
      const root = lexical.getRootElement();
      return root !== null && getActiveElement(root) === root;
    };

    // -- Connection -------------------------------------------------------------
    let seed: SerializedEditorState | null = null;
    let started = false;
    let disposed = false;
    const bootstrap = () => {
      if (!options.shouldBootstrap || !seed || shared.length > 0) return;
      applyUpdate(doc, encodeSeed(lexical, seed, shape), SEED_ORIGIN);
    };
    const onStatus = ({ status }: { status: string }) => {
      store.status.value =
        status === 'connected' || status === 'connecting' ? status : 'disconnected';
    };
    const onSync = (isSynced: boolean) => {
      store.synced.value = isSynced;
      if (!isSynced) return;
      // Some providers report sync without a status.
      if (store.status.peek() !== 'connected') store.status.value = 'connected';
      bootstrap();
    };
    const connect = () => {
      if (disposed) return;
      const { name, color } = user();
      // A fresh Awareness starts with an empty state, not null.
      if (typeof provider.awareness.getLocalState()?.name !== 'string')
        initLocalState(provider, name, color, focused(), options.awarenessData);
      if (store.status.peek() === 'disconnected') store.status.value = 'connecting';
      const result = provider.connect();
      if (result && typeof result.catch === 'function')
        result.catch(() => {
          store.status.value = 'disconnected';
        });
    };
    const disconnect = () => {
      try {
        provider.awareness.setLocalState(null);
        provider.disconnect();
      } catch {
        // Already gone.
      }
      batch(() => {
        store.status.value = 'disconnected';
        store.synced.value = false;
      });
    };
    store.connect = connect;
    store.disconnect = disconnect;

    // -- Sync -------------------------------------------------------------------
    const onYjs = (events: YEvent<any>[], transaction: Transaction) => {
      if (transaction.origin === binding) return;
      syncYjsChangesToLexical(
        binding,
        provider,
        events as never,
        transaction.origin instanceof UndoManager,
        syncCursors,
      );
      // Commit now, so a local edit right after is not folded into this
      // remote one (whose update is never sent back to Yjs).
      if (!(lexical as LexicalEditor & { _updating: boolean })._updating) lexical.read(() => {});
    };

    const cleanups: Array<() => void> = [];
    const start = () => {
      if (disposed || started) return;
      started = true;
      // What the editor was built with seeds an empty shared document.
      if (options.initialContent !== undefined && options.initialContent !== null) {
        const format =
          options.initialContentFormat ??
          (typeof options.initialContent === 'string' ? 'html' : 'json');
        editor.setContent(options.initialContent, format, {
          tag: [SKIP_COLLAB_TAG, HISTORY_MERGE_TAG],
        });
      }
      seed = editor.getJSON();
      // From here on the shared document is the content.
      lexical.update(
        () => {
          $getRoot().clear();
        },
        { discrete: true, tag: [SKIP_COLLAB_TAG, HISTORY_MERGE_TAG] },
      );
      if (shared.length > 0) {
        lexical.update(() => $loadFromYjs(binding), {
          discrete: true,
          tag: [COLLABORATION_TAG, HISTORY_MERGE_TAG],
          skipTransforms: true,
        });
      }
      shared.observeDeep(onYjs);
      cleanups.push(
        () => shared.unobserveDeep(onYjs),
        lexical.registerUpdateListener(
          ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
            if (tags.has(SKIP_COLLAB_TAG)) return;
            syncLexicalUpdateToYjs(
              binding,
              provider,
              prevEditorState,
              editorState,
              dirtyElements,
              dirtyLeaves,
              normalizedNodes,
              tags,
            );
          },
        ),
      );
      provider.on('status', onStatus);
      provider.on('sync', onSync);
      provider.awareness.on('update', onAwareness);
      cleanups.push(() => {
        provider.off('status', onStatus);
        provider.off('sync', onSync);
        provider.awareness.off('update', onAwareness);
      });
      if (options.connect) connect();
      else {
        const { name, color } = user();
        initLocalState(provider, name, color, focused(), options.awarenessData);
      }
      readPeers();
    };
    // After the editor's starting content is in (Lexical applies it after
    // every extension has registered).
    queueMicrotask(start);

    // A new name or colour, live.
    const offUser = effect(() => {
      const { name, color } = user();
      if (!started || provider.awareness.getLocalState() === null) return;
      provider.awareness.setLocalStateField('name', name);
      provider.awareness.setLocalStateField('color', color);
    });

    // Local history is off while this is on (see the peer dependency above,
    // which only applies when History is built in the same editor).
    const history = getPeerDependencyFromEditor<typeof import('@lexical/history').HistoryExtension>(
      lexical,
      '@lexical/history/History',
    );
    if (history) history.output.disabled.value = true;

    // A tab closing takes its cursor with it, at once.
    const view = typeof window === 'undefined' ? null : window;
    const leave = () => {
      try {
        provider.awareness.setLocalState(null);
      } catch {
        // Already gone.
      }
    };
    view?.addEventListener('pagehide', leave);
    view?.addEventListener('beforeunload', leave);

    // -- Cursors layer ----------------------------------------------------------
    let layer: HTMLElement | null = null;
    let ownLayer = false;
    const offRoot = lexical.registerRootListener((root) => {
      if (ownLayer) layer?.remove();
      layer = null;
      ownLayer = false;
      if (root) {
        const choice = options.cursorsContainer;
        layer = typeof choice === 'function' ? choice(root) : choice;
        if (!layer) {
          layer = root.ownerDocument.createElement('div');
          layer.className = 'tei-collab-cursors';
          root.after(layer);
          ownLayer = true;
        }
        // Decoration only: the names are not read out.
        layer.setAttribute('aria-hidden', 'true');
        layer.setAttribute('data-tei-collab-cursors', '');
      }
      binding.cursorsContainer = layer;
      if (started) syncCursors(binding, provider);
    });

    return mergeRegister(
      lexical.registerCommand(
        UNDO_COMMAND,
        () => {
          undoManager.undo();
          return true;
        },
        // Before History's handler, should it be listening.
        COMMAND_PRIORITY_LOW,
      ),
      lexical.registerCommand(
        REDO_COMMAND,
        () => {
          undoManager.redo();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      lexical.registerCommand(
        FOCUS_COMMAND,
        () => {
          const { name, color } = user();
          if (started) setLocalStateFocus(provider, name, color, true, options.awarenessData);
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      lexical.registerCommand(
        BLUR_COMMAND,
        () => {
          const { name, color } = user();
          if (started) setLocalStateFocus(provider, name, color, false, options.awarenessData);
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      offRoot,
      offUser,
      () => {
        disposed = true;
        view?.removeEventListener('pagehide', leave);
        view?.removeEventListener('beforeunload', leave);
        for (const cleanup of cleanups.splice(0)) cleanup();
        if (started) disconnect();
        undoManager.off('stack-item-added', undoState);
        undoManager.off('stack-item-popped', undoState);
        undoManager.off('stack-cleared', undoState);
        undoManager.destroy();
        for (const cursor of binding.cursors.values()) {
          if (cursor.selection) {
            cursor.selection.caret.remove();
            for (const span of cursor.selection.selections) span.remove();
          }
        }
        binding.root.destroy(binding);
        if (ownLayer) layer?.remove();
        if (history) history.output.disabled.value = false;
        const withManager = lexical as LexicalEditor & Record<symbol, unknown>;
        if (withManager[COLLAB_UNDO_MANAGER] === undoManager)
          delete withManager[COLLAB_UNDO_MANAGER];
      },
    );
  },
});

/** A Y.Array of plain objects as a {@link SharedList}. */
function sharedList<T extends { id: string }>(doc: Doc, name: string): SharedList<T> {
  const array = doc.getArray<T>(name) as YArray<T>;
  const indexOf = (id: string) => array.toArray().findIndex((item) => item.id === id);
  return {
    get: () => array.toArray(),
    push: (item) => array.push([item]),
    remove: (id) => {
      const index = indexOf(id);
      if (index >= 0) array.delete(index, 1);
    },
    update: (id, patch) => {
      const index = indexOf(id);
      if (index < 0) return;
      const next = { ...(array.get(index) as T), ...patch };
      doc.transact(() => {
        array.delete(index, 1);
        array.insert(index, [next]);
      });
    },
    subscribe: (listener) => {
      const observer = () => listener();
      array.observe(observer);
      return () => array.unobserve(observer);
    },
  };
}

/** The storage of an editor with {@link Collaboration}, if installed. */
export function getCollaboration(editor: TeiEditor): CollaborationStorage | undefined {
  return editor.extension(Collaboration)?.output.storage as CollaborationStorage | undefined;
}

/** A user's colour from a name, for apps without one: the same name, the same colour. */
export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLLABORATION_COLORS[Math.abs(hash) % COLLABORATION_COLORS.length] as string;
}
