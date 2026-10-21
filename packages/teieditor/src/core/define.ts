import {
  batch,
  getExtensionDependencyFromEditor,
  KeyboardShortcutsExtension,
  namedSignals,
} from '@lexical/extension';
import {
  type AnyLexicalExtension,
  type AnyLexicalExtensionArgument,
  configExtension,
  createCommand,
  defineExtension,
  type InitialEditorConfig,
  type KeyboardShortcut,
  type LexicalEditor,
  type LexicalExtension,
  type NormalizedLexicalExtensionArgument,
  type NormalizedPeerDependency,
} from 'lexical';
import { type TeiCoreConfig, TeiCoreExtension, type TeiFormat } from './core-extension.js';
import type { TeiEditor } from './editor.js';
import { parseKey } from './keymap.js';
import type {
  TeiActiveCheck,
  TeiCommandContext,
  TeiCommandMiddleware,
  TeiContext,
  TeiEvents,
  TeiItem,
  TeiKeyBinding,
} from './types.js';

type AnyConfig = Record<string, unknown>;

/** What an extension's own code is given: the editor, plus its live options and storage. */
export interface TeiExtensionContext<Config, Storage> extends TeiContext {
  /** The extension's options, always current (they can change at runtime). */
  options: Readonly<Config>;
  /** The extension's storage object. */
  storage: Storage;
}

type WithSelf<Fn, Config, Storage> = Fn extends (ctx: infer C, ...args: infer A) => infer R
  ? (ctx: C & TeiExtensionContext<Config, Storage>, ...args: A) => R
  : never;

export interface TeiExtensionCommand<Config, Storage> {
  run: (
    ctx: TeiCommandContext & TeiExtensionContext<Config, Storage>,
    ...args: any[]
  ) => boolean | undefined | void;
  can?: (ctx: TeiExtensionContext<Config, Storage>, ...args: any[]) => boolean;
}

type ExtensionEvents<Config, Storage> = {
  [K in keyof TeiEvents]?: WithSelf<NonNullable<TeiEvents[K]>, Config, Storage>;
};

/**
 * Everything an extension can declare. All of it is optional except
 * `name`; anything not declared costs nothing.
 */
export interface TeiExtensionSpec<Name extends string, Config extends AnyConfig, Storage>
  extends ExtensionEvents<Config, Storage> {
  /** Unique name. Scope it: `'@acme/teieditor/mention'`. */
  name: Name;
  /** Default options; `.configure()` overrides them and they can change live. */
  config?: Config;
  /** Merge strategy for options; shallow by default. */
  mergeConfig?: (config: Config, overrides: Partial<Config>) => Config;
  /** Extensions this one needs, by reference, optionally configured. */
  dependencies?: AnyLexicalExtensionArgument[];
  /** Extensions this one configures if present, by name. */
  peerDependencies?: NormalizedPeerDependency<AnyLexicalExtension>[];
  /** Names of extensions that cannot be installed alongside this one. */
  conflictsWith?: string[];
  /** Lexical nodes, theme classes and HTML import/export overrides. */
  nodes?: InitialEditorConfig['nodes'];
  theme?: InitialEditorConfig['theme'];
  html?: InitialEditorConfig['html'];
  /** Commands by name: `editor.commands.x()`, `editor.chain().x()`. */
  commands?: Record<string, TeiExtensionCommand<Config, Storage>>;
  /** Active-state checks by name: `editor.isActive(x)`. */
  active?: Record<string, WithSelf<TeiActiveCheck, Config, Storage>>;
  /** Keyboard shortcuts by name. Apps remap or disable them by the same name. */
  keymap?: Record<string, TeiKeyBinding>;
  /** UI items (toolbar buttons, slash rows, …). */
  items?: readonly TeiItem[];
  /** Default English strings for this extension's UI, by id. */
  messages?: Record<string, string>;
  /** Content formats this extension can read and write. */
  formats?: Record<string, TeiFormat>;
  /** Wrap every command run. */
  middleware?: readonly TeiCommandMiddleware[];
  /** Per-editor storage, created once when the editor is built. */
  storage?: (ctx: {
    editor: TeiEditor;
    lexical: LexicalEditor;
    options: Readonly<Config>;
  }) => Storage;
  /**
   * Raw Lexical access: register listeners, transforms, commands. Return a
   * clean-up function. `signal` aborts when the editor is disposed.
   */
  register?: (
    ctx: TeiExtensionContext<Config, Storage> & { signal: AbortSignal },
  ) => (() => void) | void;
}

/** The output every teieditor extension builds: its live options and its storage. */
export interface TeiExtensionOutput<Config, Storage> {
  options: ReturnType<typeof namedSignals<Config>>;
  storage: Storage;
}

export type TeiExtension<
  Name extends string = string,
  Config extends AnyConfig = AnyConfig,
  Storage = unknown,
> = LexicalExtension<Config, Name, TeiExtensionOutput<Config, Storage>, unknown> & {
  /** Same extension, with options overridden. */
  configure: (
    options: Partial<Config>,
  ) => NormalizedLexicalExtensionArgument<
    Config,
    Name,
    TeiExtensionOutput<Config, Storage>,
    unknown
  >;
  /**
   * A new extension layered on this one: its commands, active states,
   * keymap entries, items and messages replace this one's by name, and its
   * `config` overrides this one's options. The original stays installed
   * underneath, so `next()` in an overriding command calls it.
   */
  extend: <N extends string = string, S = Storage>(
    spec: Omit<Partial<TeiExtensionSpec<N, Config, S>>, 'config'> & {
      name?: N;
      config?: Partial<Config>;
    },
  ) => TeiExtension<N, Config, S>;
};

let extendCount = 0;

/** Read options from signals at access time, so they are always current. */
function liveOptions<Config>(
  signals: TeiExtensionOutput<Config, unknown>['options'],
): Readonly<Config> {
  return new Proxy({} as Config & object, {
    get: (_, key) =>
      (signals as Record<string | symbol, { value: unknown } | undefined>)[key]?.value,
    has: (_, key) => key in (signals as object),
    ownKeys: () => Reflect.ownKeys(signals as object),
    getOwnPropertyDescriptor: (_, key) =>
      key in (signals as object)
        ? {
            enumerable: true,
            configurable: true,
            value: (signals as Record<string | symbol, { value: unknown }>)[key]?.value,
          }
        : undefined,
  });
}

/**
 * Define an extension. This is the one way teieditor's own features are
 * built, so an app's extensions have exactly the same power.
 *
 * @example
 * ```ts
 * export const Highlight = defineTeiExtension({
 *   name: '@acme/highlight',
 *   config: { color: 'yellow' },
 *   commands: {
 *     toggleHighlight: { run: ({ options }) => $toggleHighlight(options.color) },
 *   },
 *   active: { highlight: () => $isHighlighted() },
 *   keymap: { toggleHighlight: { key: 'Mod-Shift-h', command: 'toggleHighlight' } },
 *   items: [{ id: 'highlight', label: 'Highlight', icon: 'highlighter', in: ['bubble'],
 *             command: 'toggleHighlight', active: 'highlight' }],
 * });
 * ```
 */
export function defineTeiExtension<
  Name extends string,
  Config extends AnyConfig = Record<never, never>,
  Storage = undefined,
>(spec: TeiExtensionSpec<Name, Config, Storage>): TeiExtension<Name, Config, Storage> {
  // Filled in once the extension object exists; every closure below reads it.
  let self!: TeiExtension<Name, Config, Storage>;

  const output = (lexical: LexicalEditor) =>
    getExtensionDependencyFromEditor(lexical, self).output as TeiExtensionOutput<Config, Storage>;
  const withSelf = <C extends TeiContext>(ctx: C): C & TeiExtensionContext<Config, Storage> => {
    const out = output(ctx.lexical);
    return Object.assign(Object.create(null), ctx, {
      options: liveOptions(out.options),
      storage: out.storage,
    });
  };

  const core: Partial<TeiCoreConfig> = {};
  if (spec.commands) {
    core.commands = Object.fromEntries(
      Object.entries(spec.commands).map(([name, command]) => [
        name,
        {
          run: (ctx: TeiCommandContext, ...args: unknown[]) => command.run(withSelf(ctx), ...args),
          can:
            command.can &&
            ((ctx: TeiContext, ...args: unknown[]) =>
              command.can?.(withSelf(ctx), ...args) ?? true),
        },
      ]),
    );
  }
  if (spec.active) {
    core.active = Object.fromEntries(
      Object.entries(spec.active).map(([name, check]) => [
        name,
        (ctx: TeiContext, ...args: unknown[]) => (check as TeiActiveCheck)(withSelf(ctx), ...args),
      ]),
    );
  }
  if (spec.items) core.items = Object.fromEntries(spec.items.map((item) => [item.id, item]));
  if (spec.messages) core.messages = spec.messages;
  if (spec.formats) core.formats = spec.formats;
  if (spec.middleware) core.middleware = spec.middleware;
  const events: Record<string, unknown[]> = {};
  for (const name of [
    'onCreate',
    'onUpdate',
    'onSelectionUpdate',
    'onFocus',
    'onBlur',
    'onDestroy',
  ] as const) {
    const handler = spec[name] as ((ctx: TeiContext) => void) | undefined;
    if (handler) events[name] = [(ctx: TeiContext) => handler(withSelf(ctx))];
  }
  if (Object.keys(events).length) core.events = events;

  const dependencies: AnyLexicalExtensionArgument[] = [configExtension(TeiCoreExtension, core)];
  if (spec.keymap)
    dependencies.push(
      configExtension(KeyboardShortcutsExtension, { shortcuts: keymapToShortcuts(spec.keymap) }),
    );
  dependencies.push(...(spec.dependencies ?? []));

  const extension = defineExtension({
    name: spec.name,
    config: (spec.config ?? {}) as Config,
    mergeConfig: spec.mergeConfig,
    dependencies,
    peerDependencies: spec.peerDependencies,
    conflictsWith: spec.conflictsWith,
    nodes: spec.nodes,
    theme: spec.theme,
    html: spec.html,
    build(lexical, config): TeiExtensionOutput<Config, Storage> {
      const options = namedSignals(config);
      const storage = spec.storage
        ? spec.storage({ editor: getEditorHandle(lexical), lexical, options: liveOptions(options) })
        : (undefined as Storage);
      return { options, storage };
    },
    register: spec.register
      ? (lexical, _config, state) => {
          const cleanup = spec.register?.({
            ...withSelf({ editor: getEditorHandle(lexical), lexical }),
            signal: state.getSignal(),
          });
          return cleanup ?? (() => {});
        }
      : undefined,
  });

  self = Object.assign(extension, {
    configure: (options: Partial<Config>) => configExtension(extension, options),
    extend: <N extends string, S>(
      overrides: Omit<Partial<TeiExtensionSpec<N, Config, S>>, 'config'> & {
        name?: N;
        config?: Partial<Config>;
      },
    ) => {
      const { config, name, ...rest } = overrides;
      return defineTeiExtension<N, Config, S>({
        ...(rest as Partial<TeiExtensionSpec<N, Config, S>>),
        name: (name ?? `${spec.name}+${++extendCount}`) as N,
        dependencies: [
          config ? configExtension(extension, config) : extension,
          ...(rest.dependencies ?? []),
        ],
      });
    },
  }) as unknown as TeiExtension<Name, Config, Storage>;
  return self;
}

/** The handle the core extension built for this Lexical editor. */
function getEditorHandle(lexical: LexicalEditor): TeiEditor {
  return getExtensionDependencyFromEditor(lexical, TeiCoreExtension).output.editor;
}

/**
 * One Lexical command for every teieditor key binding: the binding's own
 * `$dispatch` runs the teieditor command it names, so a shortcut and the
 * toolbar button for it share one code path and one override.
 */
const TEI_KEY_COMMAND = createCommand<KeyboardEvent>('TEI_KEY_COMMAND');

export function keymapToShortcuts(
  keymap: Record<string, TeiKeyBinding | null>,
): Record<string, KeyboardShortcut[] | null> {
  return Object.fromEntries(
    Object.entries(keymap).map(([name, binding]) => {
      if (!binding) return [name, null];
      const keys = typeof binding.key === 'string' ? [binding.key] : binding.key;
      const shortcuts = keys.flatMap(parseKey).map(
        (match): KeyboardShortcut => ({
          ...match,
          command: TEI_KEY_COMMAND,
          description: binding.description,
          $dispatch: (_command, event, _next, lexical) => {
            const editor = getEditorHandle(lexical);
            const handled =
              typeof binding.command === 'function'
                ? binding.command(editor, event)
                : editor.commands[binding.command](...(binding.args ?? []));
            if (handled) event.preventDefault();
            return handled;
          },
        }),
      );
      return [name, shortcuts];
    }),
  );
}

/** Change an installed extension's options while the editor runs. */
export function setExtensionOptions<Config>(
  editor: TeiEditor,
  extension: TeiExtension<string, Config & AnyConfig, unknown>,
  options: Partial<Config>,
): void {
  const found = editor.extension(extension);
  if (!found) throw new Error(`teieditor: extension "${extension.name}" is not installed`);
  const signals = found.output.options as Record<string, { value: unknown }>;
  batch(() => {
    for (const [key, value] of Object.entries(options)) {
      const signal = signals[key];
      if (signal) signal.value = value;
    }
  });
}
