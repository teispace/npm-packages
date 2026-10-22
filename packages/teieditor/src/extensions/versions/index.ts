import { batch, type ReadonlySignal, type Signal, signal } from '@lexical/extension';
import { declarePeerDependency, type SerializedEditorState } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { compare, eye, saveVersion, versionHistory } from '../../icons/index.js';
import { createShadowEditor } from '../../utils/shadow-editor.js';
import type { CollaborationStorage, SharedList } from '../collaboration/index.js';
import { blockTexts, diffDocuments, type VersionDiff } from './diff.js';

export type { BlockChange, VersionDiff, WordChange } from './diff.js';
export { diffDocuments, diffWords } from './diff.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Keep the document as it is now, under a name (default "Version n"). */
    saveVersion: [name?: string];
    /** Put a version's content back, as one undo step. */
    restoreVersion: [id: string];
    deleteVersion: [id: string];
    renameVersion: [id: string, name: string];
    /** Show or hide the versions panel (for UIs that follow `storage.panelOpen`). */
    toggleVersions: [open?: boolean];
  }
}

/** A named version of the document. Plain JSON: store it anywhere. */
export interface TeiVersion {
  id: string;
  name: string;
  /** When it was saved, in ms since the epoch. */
  createdAt: number;
  /** Who saved it: the collaboration user, or the `author` option. */
  author?: string;
  /**
   * `'json'`: `content` is the document. `'yjs'`: `snapshot` is a Yjs
   * snapshot of the shared document (base64), which only that document
   * can read back.
   */
  kind: 'json' | 'yjs';
  content?: SerializedEditorState;
  snapshot?: string;
}

export interface VersionsOptions {
  /** The versions saved before, read when the editor starts. */
  load: (() => readonly TeiVersion[] | Promise<readonly TeiVersion[]>) | null;
  /** Persist a version, new or renamed (the same `id` again: replace it). */
  onSave: ((version: TeiVersion) => void | Promise<void>) | null;
  onDelete: ((version: TeiVersion) => void | Promise<void>) | null;
  /** Keep at most this many; the oldest go first. Default `null`, no limit. */
  max: number | null;
  /**
   * `'auto'` (default): Yjs snapshots when collaborating on a document
   * kept with `gc: false`, JSON otherwise. `'json'`: always JSON.
   */
  snapshots: 'auto' | 'json';
  /**
   * When collaborating, keep the list in the shared document, so everyone
   * sees the same versions. Default true.
   */
  shared: boolean;
  /** Who saves versions, without collaboration. */
  author: string | null;
}

export interface VersionsStorage {
  /** The versions, newest first. */
  readonly versions: ReadonlySignal<readonly TeiVersion[]>;
  /** Whether `load` has finished (true at once without one). */
  readonly ready: ReadonlySignal<boolean>;
  /** The version shown read-only, if any. */
  readonly previewing: ReadonlySignal<string | null>;
  /** Whether the versions panel is open, for UIs that follow it. */
  readonly panelOpen: ReadonlySignal<boolean>;
  save(name?: string): TeiVersion;
  /** Replace the document with a version, as one undo step. */
  restore(id: string): boolean;
  remove(id: string): boolean;
  rename(id: string, name: string): boolean;
  get(id: string): TeiVersion | undefined;
  /** A version's document as Lexical JSON. */
  content(id: string): SerializedEditorState | null;
  /** How `from` became `to` (default: the document now). */
  compare(from: string, to?: string): VersionDiff | null;
  /** Show a version read-only (`null` to stop). */
  preview(id: string | null): void;
  /**
   * Draw a version read-only into `element`, with the editor's nodes and
   * theme. Returns the clean-up. Nodes that need the editor's extensions to
   * draw may show empty; their text is kept.
   */
  renderPreview(id: string, element: HTMLElement): () => void;
  /** Read `load` again. */
  reload(): Promise<void>;
}

type Mutable = {
  -readonly [K in keyof VersionsStorage]: VersionsStorage[K] extends ReadonlySignal<infer T>
    ? Signal<T>
    : VersionsStorage[K];
};

const COLLABORATION = '@teispace/teieditor/collaboration';
const LIST_NAME = 'teieditor-versions';

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36)}`;

const newestFirst = (list: Iterable<TeiVersion>): TeiVersion[] => {
  const byId = new Map<string, TeiVersion>();
  for (const version of list) byId.set(version.id, version);
  // Saved in the same millisecond: the later one first.
  return [...byId.values()]
    .map((version, index) => ({ version, index }))
    .sort((a, b) => b.version.createdAt - a.version.createdAt || b.index - a.index)
    .map(({ version }) => version);
};

const report = (result: void | Promise<void>) => {
  if (result && typeof result.catch === 'function')
    result.catch((error: unknown) => console.error('[teieditor] versions:', error));
};

const notStarted = () => {
  throw new Error('teieditor: versions have not started yet');
};

/**
 * Named versions of the document: save one, look at it, compare it with
 * now, put it back (one undo step), or delete it. With collaboration they
 * are Yjs snapshots kept in the shared document, so everyone sees the same
 * list (on a `gc: false` document; else JSON); without, plain JSON. Either
 * way `onSave`, `onDelete` and `load` persist them where the app likes.
 * In React, `<VersionsPanel>` lists them.
 */
export const Versions = defineTeiExtension({
  name: '@teispace/teieditor/versions',
  config: {
    load: null,
    onSave: null,
    onDelete: null,
    max: null,
    snapshots: 'auto',
    shared: true,
    author: null,
  } as VersionsOptions,
  // Collaboration, when installed, starts first: its shared list is ours.
  peerDependencies: [declarePeerDependency(COLLABORATION)],
  storage: (): VersionsStorage => {
    const storage: Mutable = {
      versions: signal<readonly TeiVersion[]>([]),
      ready: signal(false),
      previewing: signal<string | null>(null),
      panelOpen: signal(false),
      save: notStarted,
      restore: notStarted,
      remove: notStarted,
      rename: notStarted,
      get: notStarted,
      content: notStarted,
      compare: notStarted,
      preview: notStarted,
      renderPreview: notStarted,
      reload: notStarted,
    };
    return storage;
  },
  commands: {
    saveVersion: { run: ({ storage }, name?: string) => Boolean(storage.save(name)) },
    restoreVersion: {
      run: ({ storage }, id: string) => storage.restore(id),
      can: ({ storage, editor }, id: string) =>
        editor.isEditable && (id === undefined || Boolean(storage.get(id))),
    },
    deleteVersion: {
      run: ({ storage }, id: string) => storage.remove(id),
      can: ({ storage }, id: string) => id === undefined || Boolean(storage.get(id)),
    },
    renameVersion: {
      run: ({ storage }, id: string, name: string) => storage.rename(id, name),
    },
    toggleVersions: {
      run: ({ storage }, open?: boolean) => {
        const panel = storage.panelOpen as Signal<boolean>;
        panel.value = open ?? !panel.peek();
        return true;
      },
    },
  },
  active: { versionsOpen: ({ storage }) => storage.panelOpen.peek() },
  icons: { versionHistory, saveVersion, eye, compare },
  messages: {
    'versions.label': 'Version history',
    'versions.save': 'Save version',
    'versions.saveAs': 'Save',
    'versions.name': 'Version name',
    'versions.defaultName': 'Version {count}',
    'versions.empty': 'No versions yet. Save one to come back to it later.',
    'versions.loading': 'Loading versions…',
    'versions.preview': 'Preview',
    'versions.closePreview': 'Close preview',
    'versions.previewOf': 'Preview of “{name}”',
    'versions.compare': 'Compare with now',
    'versions.unchanged': 'Same as now',
    'versions.summary': '{added} added, {removed} removed, {changed} changed',
    'versions.added': 'Added',
    'versions.removed': 'Removed',
    'versions.restore': 'Restore',
    'versions.delete': 'Delete',
    'versions.cancel': 'Cancel',
    'versions.restoreTitle': 'Restore “{name}”?',
    'versions.restoreBody':
      'The document will be replaced by this version. Undo brings back what is there now.',
    'versions.deleteTitle': 'Delete “{name}”?',
    'versions.deleteBody': 'The version will be gone for good. The document stays as it is.',
    'versions.restored': 'Restored “{name}”',
    'versions.saved': 'Saved “{name}”',
    'versions.deleted': 'Deleted “{name}”',
    'versions.by': 'by {name}',
  },
  items: [
    {
      id: 'saveVersion',
      label: 'versions.save',
      icon: 'saveVersion',
      in: ['document'],
      group: 'versions',
      order: 0,
      command: 'saveVersion',
    },
    {
      id: 'versionHistory',
      label: 'versions.label',
      icon: 'versionHistory',
      in: ['document'],
      group: 'versions',
      order: 1,
      command: 'toggleVersions',
      active: 'versionsOpen',
    },
  ],
  register: ({ editor, lexical, options, storage }) => {
    const store = storage as Mutable;
    const versions = store.versions as Signal<readonly TeiVersion[]>;
    const collab = (
      editor.extension(COLLABORATION)?.output as { storage?: CollaborationStorage } | undefined
    )?.storage;
    let disposed = false;

    // Where the list lives: the shared document, or here.
    let list: SharedList<TeiVersion> | null = null;
    let offList = () => {};
    if (collab && options.shared) {
      list = collab.sharedList<TeiVersion>(LIST_NAME);
      const read = () => {
        versions.value = newestFirst((list as SharedList<TeiVersion>).get());
      };
      offList = list.subscribe(read);
      read();
    }
    const setAll = (next: Iterable<TeiVersion>) => {
      versions.value = newestFirst(next);
    };
    const add = (version: TeiVersion) => {
      if (list) {
        if (!list.get().some((v) => v.id === version.id)) list.push(version);
      } else setAll([...versions.peek(), version]);
    };
    const drop = (id: string) => {
      if (list) list.remove(id);
      else setAll(versions.peek().filter((v) => v.id !== id));
    };
    const change = (id: string, patch: Partial<TeiVersion>) => {
      if (list) list.update(id, patch);
      else setAll(versions.peek().map((v) => (v.id === id ? { ...v, ...patch } : v)));
    };

    const get = (id: string) => versions.peek().find((v) => v.id === id);

    const content = (id: string): SerializedEditorState | null => {
      const version = get(id);
      if (!version) return null;
      if (version.kind === 'yjs' && version.snapshot) {
        if (!collab) return version.content ?? null;
        return collab.snapshotToJSON({ snapshot: version.snapshot });
      }
      return version.content ?? null;
    };

    const save = (name?: string): TeiVersion => {
      const snapshot = options.snapshots === 'auto' ? (collab?.snapshot() ?? null) : null;
      const version: TeiVersion = {
        id: newId(),
        name:
          name?.trim() || editor.t('versions.defaultName', { count: versions.peek().length + 1 }),
        createdAt: Date.now(),
        ...(snapshot
          ? { kind: 'yjs' as const, snapshot: snapshot.snapshot }
          : { kind: 'json' as const, content: editor.getJSON() }),
      };
      const author = collab?.self.peek()?.name ?? options.author;
      if (author) version.author = author;
      add(version);
      if (options.onSave) report(options.onSave(version));
      // Over the limit: the oldest go.
      const max = options.max;
      if (max !== null && max >= 0) for (const old of versions.peek().slice(max)) remove(old.id);
      return version;
    };

    const remove = (id: string): boolean => {
      const version = get(id);
      if (!version) return false;
      drop(id);
      if (store.previewing.peek() === id) store.previewing.value = null;
      if (options.onDelete) report(options.onDelete(version));
      return true;
    };

    const rename = (id: string, name: string): boolean => {
      const version = get(id);
      const trimmed = name.trim();
      if (!version || !trimmed || trimmed === version.name) return false;
      change(id, { name: trimmed });
      if (options.onSave) report(options.onSave({ ...version, name: trimmed }));
      return true;
    };

    const restore = (id: string): boolean => {
      const json = content(id);
      if (!json || !editor.isEditable) return false;
      // One undo step of its own: not merged with typing before or after.
      collab?.stopCapturing();
      editor.setContent(json, 'json');
      store.previewing.value = null;
      queueMicrotask(() => collab?.stopCapturing());
      return true;
    };

    const compareVersions = (from: string, to?: string): VersionDiff | null => {
      const before = content(from);
      const after = to === undefined ? editor.getJSON() : content(to);
      return before && after ? diffDocuments(before, after) : null;
    };

    const renderPreview = (id: string, element: HTMLElement): (() => void) => {
      const json = content(id);
      if (!json) return () => {};
      element.setAttribute('contenteditable', 'false');
      const shadow = createShadowEditor(lexical);
      try {
        shadow.setRootElement(element);
        shadow.setEditorState(shadow.parseEditorState(json));
        return () => shadow.setRootElement(null);
      } catch {
        // A node that cannot draw without the editor's extensions: the text then.
        shadow.setRootElement(null);
        const doc = element.ownerDocument;
        element.replaceChildren(
          ...blockTexts(json).map((text) => {
            const p = doc.createElement('p');
            p.textContent = text;
            return p;
          }),
        );
        return () => element.replaceChildren();
      }
    };

    const reload = async () => {
      const load = options.load;
      if (!load) {
        (store.ready as Signal<boolean>).value = true;
        return;
      }
      (store.ready as Signal<boolean>).value = false;
      try {
        const loaded = await load();
        if (disposed) return;
        batch(() => {
          if (list) for (const version of loaded) add(version);
          else setAll([...versions.peek(), ...loaded]);
        });
      } catch (error) {
        console.error('[teieditor] versions: load failed', error);
      } finally {
        if (!disposed) (store.ready as Signal<boolean>).value = true;
      }
    };

    Object.assign(store, {
      save,
      restore,
      remove,
      rename,
      get,
      content,
      compare: compareVersions,
      preview: (id: string | null) => {
        store.previewing.value = id && get(id) ? id : null;
      },
      renderPreview,
      reload,
    });
    report(reload());

    return () => {
      disposed = true;
      offList();
    };
  },
});

/** The storage of an editor with {@link Versions}, if installed. */
export function getVersions(editor: TeiEditor): VersionsStorage | undefined {
  return editor.extension(Versions)?.output.storage as VersionsStorage | undefined;
}
