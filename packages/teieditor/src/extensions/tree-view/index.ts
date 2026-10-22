import { effect, type Signal, signal } from '@lexical/extension';
import { type EditorState, HISTORIC_TAG, type LexicalEditor, mergeRegister } from 'lexical';
import { defineTeiExtension, setExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  chevronLeft,
  chevronRight,
  clock,
  close,
  copy,
  listTree,
  pause,
  play,
} from '../../icons/index.js';
import { indentHTML } from '../../utils/indent-html.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Show or hide the node tree panel (`<TreeViewPanel>`). */
    toggleTreeView: [];
  }
  interface TeiActiveStates {
    treeView: [];
  }
}

const NAME = '@teispace/teieditor/tree-view';

export interface TreeViewOptions {
  /** Whether the panel shows. Off by default; `toggleTreeView` flips it. */
  open: boolean;
  /** Most editor states kept for time travel; the oldest go first. Default 500. */
  maxStates: number;
  /** Trees with more nodes than this wait for a click before they are drawn. Default 1,000. */
  largeTree: number;
}

/** One recorded editor state. */
export interface TreeViewEntry {
  /** When it was committed, from `Date.now()`. */
  time: number;
  state: EditorState;
  /** Its update's tags. */
  tags: readonly string[];
  /** Whether the document changed, rather than only the selection. */
  docChanged: boolean;
}

export interface TreeViewStorage {
  /** Every editor state since the editor started (up to `maxStates`), oldest first. */
  history: Signal<readonly TreeViewEntry[]>;
  /** The entry on show while travelling; `null` while the editor is live. */
  travelling: Signal<number | null>;
  /**
   * Show a recorded state. The editor is read-only until
   * `exitTimeTravel`, and nothing is recorded meanwhile.
   */
  travelTo(index: number): boolean;
  /** Back to the state the editor had before travelling, and its editability. */
  exitTimeTravel(): void;
  /** Forget the recorded states (not while travelling). */
  clearHistory(): void;
}

/** Inner state, out of the public storage. */
interface Traveller {
  /** The live state and editability to come back to. */
  live: EditorState | null;
  editable: boolean;
}

/**
 * The node tree, for developers: `<TreeViewPanel>` shows the live tree, the
 * selection and the document as JSON or HTML, and travels back through
 * every update like Lexical's playground. This extension records the
 * states and opens the panel (from the document menu, or
 * `toggleTreeView`); the panel and `@lexical/devtools-core` load only when
 * it opens.
 *
 * Install it in development builds: it keeps every state it records.
 */
export const TreeView = defineTeiExtension({
  name: NAME,
  config: { open: false, maxStates: 500, largeTree: 1_000 } as TreeViewOptions,
  storage: ({ editor, lexical }): TreeViewStorage => {
    const travel: Traveller = { live: null, editable: true };
    const storage: TreeViewStorage = {
      history: signal<readonly TreeViewEntry[]>([]),
      travelling: signal<number | null>(null),
      travelTo(index) {
        const entry = storage.history.peek()[index];
        if (!entry) return false;
        if (storage.travelling.peek() === null) {
          travel.live = lexical.getEditorState();
          travel.editable = editor.isEditable;
          // Before the state changes: a read-only editor takes no input meanwhile.
          editor.setEditable(false);
        }
        storage.travelling.value = index;
        setState(lexical, entry.state);
        return true;
      },
      exitTimeTravel() {
        if (storage.travelling.peek() === null) return;
        const { live } = travel;
        travel.live = null;
        if (live) setState(lexical, live);
        storage.travelling.value = null;
        editor.setEditable(travel.editable);
      },
      clearHistory() {
        if (storage.travelling.peek() !== null) return;
        storage.history.value = [];
      },
    };
    return storage;
  },
  register: ({ lexical, storage, options }) =>
    mergeRegister(
      lexical.registerUpdateListener(
        ({ editorState, prevEditorState, tags, dirtyElements, dirtyLeaves }) => {
          if (storage.travelling.peek() !== null) return;
          const history = storage.history.peek();
          if (history[history.length - 1]?.state === editorState) return;
          const entry: TreeViewEntry = {
            time: Date.now(),
            state: editorState,
            tags: [...tags],
            docChanged: dirtyElements.size > 0 || dirtyLeaves.size > 0,
          };
          // The first commit: the state before it is where the history starts.
          const start =
            history.length === 0 && !prevEditorState.isEmpty()
              ? [{ time: entry.time, state: prevEditorState, tags: [], docChanged: false }]
              : [];
          const next = [...history, ...start, entry];
          const max = Math.max(2, options.maxStates);
          storage.history.value = next.length > max ? next.slice(next.length - max) : next;
        },
      ),
      // Closed while travelling: back to now, after the update that closed it.
      effect(() => {
        if (!options.open) queueMicrotask(() => storage.exitTimeTravel());
      }),
      // Taken away while travelling: leave the editor as it was found.
      () => storage.exitTimeTravel(),
    ),
  commands: {
    toggleTreeView: {
      run: ({ editor, options }) => {
        setExtensionOptions(editor, TreeView, { open: !options.open });
      },
    },
  },
  active: { treeView: ({ options }) => options.open },
  icons: { listTree, play, pause, clock, copy, close, chevronLeft, chevronRight },
  messages: {
    'treeView.toggle': 'Node tree',
    'treeView.label': 'Node tree',
    'treeView.views': 'View',
    'treeView.tree': 'Tree',
    'treeView.json': 'JSON',
    'treeView.html': 'HTML',
    'treeView.copy': 'Copy',
    'treeView.copied': 'Copied',
    'treeView.close': 'Close',
    'treeView.timeTravel': 'Time travel',
    'treeView.play': 'Play',
    'treeView.pause': 'Pause',
    'treeView.previous': 'Previous update',
    'treeView.next': 'Next update',
    'treeView.update': 'Update',
    'treeView.position': 'Update {current} of {total}',
    'treeView.exit': 'Back to now',
    'treeView.loading': 'Loading…',
    'treeView.large': 'This document has {count} nodes: drawing its tree may be slow.',
    'treeView.showAnyway': 'Show the tree',
    'treeView.error': 'Could not draw the tree: {message}',
  },
  items: [
    {
      id: 'treeView',
      label: 'treeView.toggle',
      icon: 'listTree',
      in: ['document'],
      group: 'view',
      order: 90,
      command: 'toggleTreeView',
      active: 'treeView',
    },
  ],
});

/**
 * Swap the editor's state as time travel does: tagged `historic`, like
 * undo, so the undo history keeps no step for it.
 */
function setState(lexical: LexicalEditor, state: EditorState): void {
  lexical.setEditorState(state, { tag: HISTORIC_TAG });
}

/** The time-travel state of an editor, if TreeView is installed. */
export function getTreeViewStorage(editor: TeiEditor): TreeViewStorage | undefined {
  return (editor.extension(NAME)?.output as { storage: TreeViewStorage } | undefined)?.storage;
}

/** What the panel shows: the node tree, or the document as JSON or as HTML. */
export type TreeViewMode = 'tree' | 'json' | 'html';

/**
 * The document as the panel shows it, for logs and bug reports: the node
 * tree with the selection (from `@lexical/devtools-core`, loaded now), or
 * the JSON and HTML the editor saves, indented.
 */
export async function printNodeTree(
  editor: TeiEditor,
  mode: TreeViewMode = 'tree',
): Promise<string> {
  if (mode === 'json') return JSON.stringify(editor.getJSON(), null, 2);
  if (mode === 'html') return indentHTML(editor.getHTML());
  const { generateContent } = await import('@lexical/devtools-core');
  return generateContent(editor.lexical, [], false);
}

export { indentHTML } from '../../utils/indent-html.js';
