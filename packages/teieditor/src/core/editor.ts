import {
  formatKeyboardShortcut,
  getExtensionDependencyFromEditor,
  KeyboardShortcutsExtension,
} from '@lexical/extension';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type AnyLexicalExtension,
  type LexicalEditor,
  type LexicalExtensionConfig,
  type LexicalExtensionOutput,
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

/** `editor.commands`: run one command now. */
export type TeiCommandRunner = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => boolean;
} & Record<string, (...args: any[]) => boolean>;

/** `editor.chain()`: queue commands, then `run()` them as one undo step. */
export type TeiChain = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => TeiChain;
} & Record<string, (...args: any[]) => TeiChain> & {
    /** Focus the editor when the chain runs (`'start'`, `'end'`, or keep the selection). */
    focus: (position?: FocusPosition) => TeiChain;
    /** Run the queued commands in one update; `true` if all of them applied. */
    run: () => boolean;
  };

/** `editor.can()`: would this command do anything right now? */
export type TeiCan = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => boolean;
} & Record<string, (...args: any[]) => boolean> & { chain: () => TeiCanChain };

export type TeiCanChain = {
  [K in keyof TeiCommands]: (...args: CommandArgs<K>) => TeiCanChain;
} & Record<string, (...args: any[]) => TeiCanChain> & { run: () => boolean };

/** `null` keeps the current selection; otherwise move it before focusing. */
export type FocusPosition = 'start' | 'end' | 'all' | null;

/** Content as stored or exchanged: a format name and its value. */
export type ContentFormat = 'json' | 'html' | 'markdown' | 'text' | (string & {});

const handles = new WeakMap<LexicalEditor, TeiEditor>();

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
              get: (__, step: string | symbol) =>
                isProbe(step)
                  ? undefined
                  : step === 'run'
                    ? () => this.read(() => steps.every(([n, a]) => this.#check(n, a)))
                    : (...args: unknown[]) => {
                        steps.push([step, args]);
                        return chain;
                      },
            });
            return chain;
          };
        }
        return (...args: unknown[]) => this.read(() => this.#check(name, args));
      },
    });
    return this.#can;
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

  #check(name: string, args: unknown[]): boolean {
    const spec = this.#config.commands[name];
    if (!spec) return false;
    return spec.can ? spec.can(this.#ctx(), ...args) : true;
  }

  #ctx(): TeiContext {
    return { editor: this, lexical: this.lexical };
  }

  /**
   * Run `fn` in an update and return its result. Commits synchronously, so
   * what a command did is readable on the next line. Inside an existing
   * update (a key handler, another command) it joins that update instead.
   */
  #update<T>(fn: () => T): T {
    let result!: T;
    this.lexical.update(
      () => {
        result = fn();
      },
      { discrete: true },
    );
    return result;
  }

  /** Read the current state: `editor.read(() => $getRoot().getTextContent())`. */
  read<T>(fn: () => T): T {
    return this.lexical.getEditorState().read(fn, { editor: this.lexical });
  }

  /** Change the document with Lexical's `$` API, as one undo step. */
  update(fn: () => void, options?: { tag?: string | string[] }): void {
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
    this.update(() => codec.parse(this.#ctx(), value), options);
  }

  getJSON(): SerializedEditorState {
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

  /** The UI items for a placement, sorted by group order then item order. */
  items(placement: TeiPlacement): TeiItem[] {
    return Object.values(this.#config.items)
      .filter((item): item is TeiItem => Boolean(item?.in.includes(placement)))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** Look up a message by id, falling back to the id itself. */
  t(id: string, values?: Record<string, string | number>): string {
    const message = this.#config.messages[id] ?? id;
    return values
      ? message.replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m))
      : message;
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
      [item.command](...(item.args ?? []))
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

function $placeSelection(position: FocusPosition): void {
  const root = $getRoot();
  if (position === 'start') root.selectStart();
  else if (position === 'end') root.selectEnd();
  else if (position === 'all') root.select(0, root.getChildrenSize());
  else if (!$isRangeSelection($getSelection()) && !$getSelection()) root.selectEnd();
}
