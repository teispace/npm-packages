import type { KeyboardShortcut, LexicalEditor } from 'lexical';
import type { TeiEditor } from './editor.js';

/**
 * Commands by name, with their argument tuples. Extensions add to it by
 * declaration merging, which is what types `editor.commands.x(...)` and
 * `editor.chain().x(...)`:
 *
 * ```ts
 * declare module '@teispace/teieditor' {
 *   interface TeiCommands {
 *     toggleBold: [];
 *     setHeading: [tag: 'h1' | 'h2' | 'h3'];
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled in by declaration merging
export interface TeiCommands {}

/** States `editor.isActive(name, ...args)` can ask about, by declaration merging like {@link TeiCommands}. */
// biome-ignore lint/suspicious/noEmptyInterface: filled in by declaration merging
export interface TeiActiveStates {}

/** Extension storage by extension name, by declaration merging. */
// biome-ignore lint/suspicious/noEmptyInterface: filled in by declaration merging
export interface TeiStorage {}

export type CommandName = keyof TeiCommands | (string & {});
export type CommandArgs<N> = N extends keyof TeiCommands
  ? TeiCommands[N] extends unknown[]
    ? TeiCommands[N]
    : unknown[]
  : unknown[];
export type ActiveName = keyof TeiActiveStates | (string & {});
export type ActiveArgs<N> = N extends keyof TeiActiveStates
  ? TeiActiveStates[N] extends unknown[]
    ? TeiActiveStates[N]
    : unknown[]
  : unknown[];

/** What a command, an active-state check or an event handler is given. */
export interface TeiContext {
  /** The editor handle. */
  editor: TeiEditor;
  /** The underlying Lexical editor, for anything the handle does not cover. */
  lexical: LexicalEditor;
}

export interface TeiCommandContext extends TeiContext {
  /**
   * The command this one replaced, when an extension or the app overrode a
   * command by name. Call it to wrap the original instead of replacing it.
   */
  next: (...args: unknown[]) => boolean;
}

/**
 * A command. `run` executes inside an editor update, so `$` functions are
 * available; it returns `false` when it did nothing.
 */
export interface TeiCommandSpec<A extends unknown[] = any[]> {
  run: (ctx: TeiCommandContext, ...args: A) => boolean | undefined | void;
  /**
   * Whether `run` would do anything now. Runs inside a read, so it must not
   * change the document. Defaults to `true`.
   */
  can?: (ctx: TeiContext, ...args: A) => boolean;
}

/** An active-state check, run inside a read: "is the selection bold?". */
export type TeiActiveCheck<A extends unknown[] = any[]> = (ctx: TeiContext, ...args: A) => boolean;

/**
 * Wraps every command run: log it, veto it (`return false` without calling
 * `next`), or change its arguments.
 */
export type TeiCommandMiddleware = (
  call: { name: string; args: unknown[]; ctx: TeiContext },
  next: (args?: unknown[]) => boolean,
) => boolean;

/**
 * An icon as plain data: SVG child elements on a 24×24 stroked canvas,
 * `[['path', { d: 'M4 12h16' }], ['circle', { cx: '12', cy: '12', r: '3' }]]`.
 * No framework in it, so extensions and the server can carry icons and any
 * UI layer can draw them.
 */
export type TeiIconNode = ReadonlyArray<
  readonly [tag: string, attrs: Readonly<Record<string, string>>]
>;

/** Where an {@link TeiItem} shows up in the UI. */
export type TeiPlacement =
  | 'toolbar'
  | 'bubble'
  | 'slash'
  | 'insert'
  | 'blockType'
  | 'blockMenu'
  | 'contextMenu';

/**
 * A UI entry an extension contributes — a toolbar button, a slash-menu row,
 * a block-type option. Plain data, so the app can reorder, regroup, relabel,
 * hide or replace any of them by `id`.
 */
export interface TeiItem {
  /** Unique id; the key apps use to override or remove it. */
  id: string;
  /** Label, or a message id resolved through the editor's messages. */
  label: string;
  /** Longer text for slash menus and tooltips. */
  description?: string;
  /** Icon name, resolved through the icon map so apps can swap it. */
  icon?: string;
  /** Where it appears. */
  in: readonly TeiPlacement[];
  /** Group within a placement (`'format'`, `'blocks'`, `'media'`, …). */
  group?: string;
  /** Sort order within its group; lower first. Default 0. */
  order?: number;
  /** Extra words the slash menu matches on. */
  keywords?: readonly string[];
  /** Name of the keymap entry to show as its shortcut hint. */
  shortcut?: string;
  /** The command to run, with arguments. */
  command?: CommandName;
  args?: readonly unknown[];
  /** Or run arbitrary code instead of a named command. */
  run?: (editor: TeiEditor) => void;
  /** Active-state name (and arguments) that lights the item up. */
  active?: ActiveName;
  activeArgs?: readonly unknown[];
  /**
   * A UI control that stands for it where a plain button won't do (a font
   * menu, a colour picker), by id. UIs that know the control render it; the
   * rest fall back to a button running `command`.
   */
  control?: string;
  /**
   * How long it stays in a toolbar short of room: the lowest go into the
   * "More" menu first. Default: by item and group (undo and bold stay
   * longest; subscript goes early).
   */
  priority?: number;
  /** Whether to offer it at all, given the editor's current options. Default: always. */
  visible?: (editor: TeiEditor) => boolean;
}

/**
 * A keymap entry. The key uses `Mod` for ⌘ on Apple platforms and Ctrl
 * elsewhere: `'Mod-b'`, `'Mod-Shift-7'`, `'Alt-Mod-1'`.
 */
export interface TeiKeyBinding {
  key: string | readonly string[];
  /** The command to run, with arguments; or a function. */
  command: CommandName | ((editor: TeiEditor, event: KeyboardEvent) => boolean);
  args?: readonly unknown[];
  /** Shown in shortcut help. */
  description?: string;
}

/** A keymap by entry name; `null` disables an entry another extension set. */
export type TeiKeymap = Record<string, TeiKeyBinding | null>;

/** Lexical's shortcut table entries, re-exported for raw access. */
export type { KeyboardShortcut };

export interface TeiUpdateEvent extends TeiContext {
  /** Whether the document changed, rather than only the selection. */
  docChanged: boolean;
  /** Update tags (`'history-merge'`, `'collaboration'`, …). */
  tags: ReadonlySet<string>;
}

export interface TeiEvents {
  onCreate?: (ctx: TeiContext) => void;
  onUpdate?: (event: TeiUpdateEvent) => void;
  onSelectionUpdate?: (ctx: TeiContext) => void;
  onFocus?: (ctx: TeiContext & { event: FocusEvent }) => void;
  onBlur?: (ctx: TeiContext & { event: FocusEvent }) => void;
  onDestroy?: (ctx: TeiContext) => void;
}

export type TeiEventName = keyof TeiEvents;
