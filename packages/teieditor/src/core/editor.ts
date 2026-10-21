import {
  formatKeyboardShortcut,
  getExtensionDependencyFromEditor,
  KeyboardShortcutsExtension,
} from '@lexical/extension';
import type { Transformer } from '@lexical/markdown';
import {
  $addUpdateTag,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type AnyLexicalExtension,
  type EditorState,
  type LexicalEditor,
  type LexicalExtensionConfig,
  type LexicalExtensionOutput,
  type RangeSelection,
  type SerializedEditorState,
} from 'lexical';
import type { TeiCoreConfig } from './core-extension.js';
import { PARENT, type WithParent } from './internal.js';
import type {
  ActiveArgs,
  ActiveName,
  CommandArgs,
  CommandName,
  TeiCommands,
  TeiContext,
  TeiEventName,
  TeiEvents,
  TeiIconNode,
  TeiItem,
  TeiPlacement,
} from './types.js';

type Listener = (arg: never) => void;

/**
 * `editor.commands`: run one command now. Typed from {@link TeiCommands},
 * so a misspelt name is a type error; for a name known only at run time
 * use `editor.command(name, ...args)`.
 */
export type TeiCommandRunner = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => boolean;
};

/** `editor.chain()`: queue commands, then `run()` them as one undo step. */
export type TeiChain = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => TeiChain;
} & {
  /** Queue a command by a name known only at run time. */
  command: <N extends CommandName>(name: N, ...args: CommandArgs<N>) => TeiChain;
  /** Focus the editor when the chain runs (`'start'`, `'end'`, or keep the selection). */
  focus: (position?: FocusPosition) => TeiChain;
  /** Run the queued commands in one update; `true` if all of them applied. */
  run: () => boolean;
};

/** `editor.can()`: would this command do anything right now? */
export type TeiCan = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => boolean;
} & {
  command: <N extends CommandName>(name: N, ...args: CommandArgs<N>) => boolean;
  chain: () => TeiCanChain;
};

export type TeiCanChain = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => TeiCanChain;
} & {
  command: <N extends CommandName>(name: N, ...args: CommandArgs<N>) => TeiCanChain;
  run: () => boolean;
};

/** `null` keeps the current selection; otherwise move it before focusing. */
export type FocusPosition = 'start' | 'end' | 'all' | null;

/** Content as stored or exchanged: a format name and its value. */
export type ContentFormat = 'json' | 'html' | 'markdown' | 'text' | (string & {});

const handles = new WeakMap<LexicalEditor, TeiEditor>();

/**
 * The order item groups appear in, in every placement. A group not listed
 * comes after these; items without a group come last.
 */
export const ITEM_GROUPS: readonly string[] = [
  'history',
  'basic',
  'format',
  'list',
  'insert',
  'media',
  'align',
  'advanced',
];

function groupRank(group: string | undefined): number {
  if (group === undefined) return ITEM_GROUPS.length + 1;
  const index = ITEM_GROUPS.indexOf(group);
  return index < 0 ? ITEM_GROUPS.length : index;
}

/**
 * Properties a proxy must not answer with a command: `then` would make it
 * look like a promise to `await`, and symbols are runtime probes
 * (`Symbol.toPrimitive`, inspection).
 */
const isProbe = (name: string | symbol): name is symbol | 'then' | 'toJSON' =>
  typeof name === 'symbol' || name === 'then' || name === 'toJSON';

/**
 * The editor handle: what an app and its UI talk to. One per Lexical
 * editor, built by the core extension; reach the Lexical editor underneath
 * through {@link TeiEditor.lexical} for anything this does not cover.
 */
export class TeiEditor {
  /** The handle for a Lexical editor, if it was built with teieditor. */
  static of(lexical: LexicalEditor): TeiEditor | undefined {
    return handles.get(lexical);
  }

  readonly lexical: LexicalEditor;
  readonly #config: TeiCoreConfig;
  readonly #listeners = new Map<TeiEventName, Set<Listener>>();
  #commands?: TeiCommandRunner;
  #can?: TeiCan;

  constructor(lexical: LexicalEditor, config: TeiCoreConfig) {
    this.lexical = lexical;
    this.#config = config;
    handles.set(lexical, this);
  }

  // -- Commands -------------------------------------------------------------

  /** Every command available, by name. */
  get commandNames(): string[] {
    return Object.keys(this.#config.commands).filter((name) => this.#config.commands[name]);
  }

  /** Whether a command exists in this editor. */
  hasCommand(name: CommandName): boolean {
    return Boolean(this.#config.commands[name]);
  }

  /** Run a command now, as its own undo step. */
  get commands(): TeiCommandRunner {
    this.#commands ??= new Proxy({} as TeiCommandRunner, {
      get: (_, name: string | symbol) =>
        isProbe(name)
          ? undefined
          : (...args: unknown[]) => this.#update(() => this.#run(name, args)),
    });
    return this.#commands;
  }

  /** Queue several commands to run as one update and one undo step. */
  chain(): TeiChain {
    const steps: Array<[string, unknown[]]> = [];
    let focus: FocusPosition | undefined;
    const chain: TeiChain = new Proxy({} as TeiChain, {
      get: (_, name: string | symbol) => {
        if (isProbe(name)) return undefined;
        if (name === 'run') {
          return () => {
            const ok = this.#update(() => {
              if (focus !== undefined) $placeSelection(focus);
              let all = true;
              for (const [step, args] of steps) all = this.#run(step, args) && all;
              return all;
            });
            if (focus !== undefined) this.#focusDOM();
            return ok;
          };
        }
        if (name === 'focus') {
          return (position: FocusPosition = null) => {
            focus = position;
            return chain;
          };
        }
        if (name === 'command') {
          return (step: string, ...args: unknown[]) => {
            steps.push([step, args]);
            return chain;
          };
        }
        return (...args: unknown[]) => {
          steps.push([name, args]);
          return chain;
        };
      },
    });
    return chain;
  }

  /** Ask whether commands would apply, without running them. */
  can(): TeiCan {
    this.#can ??= new Proxy({} as TeiCan, {
      get: (_, name: string | symbol) => {
        if (isProbe(name)) return undefined;
        if (name === 'chain') {
          return () => {
            const steps: Array<[string, unknown[]]> = [];
            const chain: TeiCanChain = new Proxy({} as TeiCanChain, {
              get: (__, step: string | symbol) => {
                if (isProbe(step)) return undefined;
                if (step === 'run')
                  return () => this.#readAsUI(() => steps.every(([n, a]) => this.#check(n, a)));
                return (...args: unknown[]) => {
                  if (step === 'command') {
                    const [named, ...rest] = args as [string, ...unknown[]];
                    steps.push([named, rest]);
                  } else steps.push([step, args]);
                  return chain;
                };
              },
            });
            return chain;
          };
        }
        if (name === 'command') {
          return (named: string, ...args: unknown[]) =>
            this.#readAsUI(() => this.#check(named, args));
        }
        return (...args: unknown[]) => this.#readAsUI(() => this.#check(name, args));
      },
    });
    return this.#can;
  }

  /** Run a command by a name known only at run time, as its own undo step. */
  command<N extends CommandName>(name: N, ...args: CommandArgs<N>): boolean {
    return this.#update(() => this.#run(name, args));
  }

  /** Whether a state is active at the selection: `isActive('bold')`, `isActive('heading', 'h2')`. */
  isActive<N extends ActiveName>(name: N, ...args: ActiveArgs<N>): boolean {
    const check = this.#config.active[name];
    if (!check) return false;
    return this.read(() => check(this.#ctx(), ...args));
  }

  #run(name: string, args: unknown[]): boolean {
    const spec = this.#config.commands[name] as WithParent | null | undefined;
    if (!spec) {
      if (name in this.#config.commands) return false; // removed with null
      throw new Error(`teieditor: no command named "${name}". Is its extension installed?`);
    }
    const ctx = this.#ctx();
    const invoke = (current: WithParent, callArgs: unknown[]): boolean => {
      const parent = current[PARENT] as WithParent | undefined;
      const next = (...nextArgs: unknown[]) =>
        parent ? invoke(parent, nextArgs.length ? nextArgs : callArgs) : false;
      return current.run({ ...ctx, next }, ...callArgs) !== false;
    };
    const chainOf = this.#config.middleware.reduceRight<(a: unknown[]) => boolean>(
      (next, middleware) => (a) => middleware({ name, args: a, ctx }, (b) => next(b ?? a)),
      (a) => invoke(spec, a),
    );
    return chainOf(args);
  }

  /**
   * Read as a command run from the UI would see the document. With no
   * selection, that is a caret at the end: where `chain().focus()` puts it
   * before the command runs. So a fresh editor's toolbar is not all
   * disabled before the first click.
   */
  #readAsUI<T>(fn: () => T): T {
    return this.read(() => {
      if ($getSelection() !== null) return fn();
      const caret = $endCaret();
      if (!caret) return fn();
      return this.lexical.getEditorState().clone(caret).read(fn, { editor: this.lexical });
    });
  }

  #check(name: string, args: unknown[]): boolean {
    const spec = this.#config.commands[name];
    if (!spec) return false;
    return spec.can ? spec.can(this.#ctx(), ...args) : true;
  }

  #ctx(): TeiContext {
    return { editor: this, lexical: this.lexical };
  }

  /**
   * Whether this editor is inside an update callback right now (a key
   * handler, a command), where Lexical would queue a nested update instead of
   * running it. Update listeners also run with `_updating` set, but after the
   * commit, with no pending state — those get a fresh update.
   */
  get #updating(): boolean {
    return (
      (this.lexical as LexicalEditor & { _updating: boolean })._updating && this.#pending !== null
    );
  }

  get #pending(): EditorState | null {
    return (this.lexical as LexicalEditor & { _pendingEditorState: EditorState | null })
      ._pendingEditorState;
  }

  /**
   * Run `fn` in an update and return its result. Commits synchronously, so
   * what a command did is readable on the next line. Inside an update that
   * is already running (a key handler, another command) it runs in place:
   * Lexical would queue a nested update until the outer one returns, and
   * the result — whether a key was handled — would be lost.
   */
  #update<T>(fn: () => T): T {
    if (this.#updating) return fn();
    let result!: T;
    this.lexical.update(
      () => {
        result = fn();
      },
      { discrete: true },
    );
    return result;
  }

  /**
   * Read the current state: `editor.read(() => $getRoot().getTextContent())`.
   * Inside an update it reads the pending state, which is what that update sees.
   */
  read<T>(fn: () => T): T {
    if (this.#updating) return fn();
    // Lexical commits pending updates first, so reads see every earlier write.
    return this.lexical.read(fn);
  }

  /** Change the document with Lexical's `$` API, as one undo step. */
  update(fn: () => void, options?: { tag?: string | string[] }): void {
    if (this.#updating) {
      for (const tag of [options?.tag ?? []].flat()) $addUpdateTag(tag);
      fn();
      return;
    }
    this.lexical.update(fn, { discrete: true, ...options });
  }

  // -- Content --------------------------------------------------------------

  /** Content in any registered format (`'json'`, `'text'`, and those extensions add). */
  getContent(format: ContentFormat = 'json'): unknown {
    const codec = this.#format(format);
    return this.read(() => codec.serialize(this.#ctx()));
  }

  /** Replace the document. Strings default to HTML, objects to JSON. */
  setContent(value: unknown, format?: ContentFormat, options?: { tag?: string | string[] }): void {
    const codec = this.#format(format ?? (typeof value === 'string' ? 'html' : 'json'));
    this.update(() => {
      codec.parse(this.#ctx(), value);
      // Replacing content from code must not take focus: a selection left
      // behind would be put into the page, focusing the editor (on page
      // load, too, for initial content). Keep one only while focused.
      if (!this.isFocused) $setSelection(null);
    }, options);
  }

  /** The document as Lexical JSON, including writes made earlier in this update. */
  getJSON(): SerializedEditorState {
    const pending = this.#updating ? this.#pending : null;
    if (pending) return pending.toJSON();
    this.lexical.read(() => {}); // commits pending updates
    return this.lexical.getEditorState().toJSON();
  }

  getText(): string {
    return this.read(() => $getRoot().getTextContent());
  }

  getHTML(): string {
    return this.getContent('html') as string;
  }

  getMarkdown(): string {
    return this.getContent('markdown') as string;
  }

  /** Content formats this editor can read and write. */
  get formats(): string[] {
    return Object.keys(this.#config.formats).filter((name) => this.#config.formats[name]);
  }

  #format(name: ContentFormat) {
    const codec = this.#config.formats[name];
    if (!codec) {
      throw new Error(
        `teieditor: no "${name}" content format. Formats available: ${this.formats.join(', ')}.`,
      );
    }
    return codec;
  }

  /** Whether the document holds nothing but one empty paragraph. */
  get isEmpty(): boolean {
    return this.read(() => {
      const root = $getRoot();
      const first = root.getFirstChild();
      return (
        root.getChildrenSize() === 0 ||
        (root.getChildrenSize() === 1 &&
          first !== null &&
          first.getTextContentSize() === 0 &&
          first.getType() === 'paragraph')
      );
    });
  }

  // -- Focus and editability ------------------------------------------------

  focus(position: FocusPosition = null): void {
    if (position !== null) this.update(() => $placeSelection(position));
    this.#focusDOM();
  }

  #focusDOM(): void {
    const root = this.lexical.getRootElement();
    if (root && root.ownerDocument.activeElement !== root) root.focus({ preventScroll: true });
  }

  blur(): void {
    this.lexical.blur();
  }

  get isFocused(): boolean {
    const root = this.lexical.getRootElement();
    return Boolean(root?.contains(root.ownerDocument.activeElement));
  }

  get isEditable(): boolean {
    return this.lexical.isEditable();
  }

  setEditable(editable: boolean): void {
    this.lexical.setEditable(editable);
  }

  // -- Extensions -----------------------------------------------------------

  /** An installed extension's live config and output, or `undefined` if absent. */
  extension<E extends AnyLexicalExtension>(
    extension: E,
  ): { config: LexicalExtensionConfig<E>; output: LexicalExtensionOutput<E> } | undefined {
    try {
      const dep = getExtensionDependencyFromEditor(this.lexical, extension);
      return { config: dep.config, output: dep.output };
    } catch {
      return undefined;
    }
  }

  // -- UI contributions -----------------------------------------------------

  /**
   * The UI items for a placement: grouped in {@link ITEM_GROUPS} order (other
   * groups after, by name), then by each item's `order`.
   */
  items(placement: TeiPlacement): TeiItem[] {
    return Object.values(this.#config.items)
      .filter(
        (item): item is TeiItem =>
          Boolean(item?.in.includes(placement)) && (item?.visible?.(this) ?? true),
      )
      .sort(
        (a, b) =>
          groupRank(a.group) - groupRank(b.group) ||
          (a.group ?? '').localeCompare(b.group ?? '') ||
          (a.order ?? 0) - (b.order ?? 0),
      );
  }

  /** Look up a message by id, falling back to the id itself. */
  t(id: string, values?: Record<string, string | number>): string {
    const message = this.#config.messages[id] ?? id;
    return values
      ? message.replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m))
      : message;
  }

  /**
   * The installed markdown transformers. Text formats come longest marker
   * first, so `***` is tried before `**` and `*`.
   */
  get markdownTransformers(): Transformer[] {
    const all = Object.values(this.#config.markdown).filter((t): t is Transformer => Boolean(t));
    const tagLength = (t: Transformer) => (t.type === 'text-format' ? t.tag.length : 0);
    return all.sort((a, b) => tagLength(b) - tagLength(a));
  }

  /** An icon by name, as registered by extensions or replaced by the app. */
  icon(name: string): TeiIconNode | undefined {
    return this.#config.icons[name];
  }

  /**
   * A shortcut's keys for display, by keymap entry name: `['⌘', 'B']` on
   * Apple platforms, `['Ctrl', 'B']` elsewhere. `undefined` when the entry
   * does not exist or was disabled.
   */
  shortcut(name: string): string[] | undefined {
    const table = this.extension(KeyboardShortcutsExtension)?.config.shortcuts[name];
    const first = Array.isArray(table) ? table[0] : table;
    return first
      ? formatKeyboardShortcut(first as Parameters<typeof formatKeyboardShortcut>[0])
      : undefined;
  }

  /** Run an item: its function, or its named command with arguments. */
  runItem(item: TeiItem): boolean {
    if (item.run) {
      item.run(this);
      return true;
    }
    if (!item.command) return false;
    return this.chain()
      .focus()
      .command(item.command, ...((item.args ?? []) as unknown[]))
      .run();
  }

  // -- Events ---------------------------------------------------------------

  /** Listen for an editor event; returns the unsubscribe function. */
  on<K extends TeiEventName>(name: K, listener: NonNullable<TeiEvents[K]>): () => void {
    let set = this.#listeners.get(name);
    if (!set) {
      set = new Set();
      this.#listeners.set(name, set);
    }
    set.add(listener as Listener);
    return () => set.delete(listener as Listener);
  }

  /** @internal Fire an event to `on()` listeners. */
  emit<K extends TeiEventName>(name: K, arg: Parameters<NonNullable<TeiEvents[K]>>[0]): void {
    for (const listener of this.#listeners.get(name) ?? [])
      (listener as (a: typeof arg) => void)(arg);
  }

  /** Tear the editor down. Only for editors this code created. */
  destroy(): void {
    const disposable = this.lexical as LexicalEditor & { dispose?: () => void };
    disposable.dispose?.();
    this.#listeners.clear();
  }
}

/** A collapsed selection at the end of the document, as `root.selectEnd()` would make. */
function $endCaret(): RangeSelection | null {
  const last = $getRoot().getLastDescendant();
  if (!last) return null;
  const selection = $createRangeSelection();
  if ($isTextNode(last)) {
    const offset = last.getTextContentSize();
    selection.anchor.set(last.getKey(), offset, 'text');
    selection.focus.set(last.getKey(), offset, 'text');
    selection.format = last.getFormat();
    selection.style = last.getStyle();
  } else {
    const element = $isElementNode(last) ? last : last.getParentOrThrow();
    const offset = $isElementNode(last) ? last.getChildrenSize() : last.getIndexWithinParent() + 1;
    selection.anchor.set(element.getKey(), offset, 'element');
    selection.focus.set(element.getKey(), offset, 'element');
  }
  return selection;
}

function $placeSelection(position: FocusPosition): void {
  const root = $getRoot();
  if (position === 'start') root.selectStart();
  else if (position === 'end') root.selectEnd();
  else if (position === 'all') root.select(0, root.getChildrenSize());
  else if (!$isRangeSelection($getSelection()) && !$getSelection()) root.selectEnd();
}
