import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  defineExtension,
  FOCUS_COMMAND,
  type LexicalEditor,
  mergeRegister,
  safeCast,
  shallowMergeConfig,
} from 'lexical';
import { TeiEditor } from './editor.js';
import { jsonFormat, textFormat } from './formats.js';
import { PARENT, type WithParent } from './internal.js';
import type {
  TeiActiveCheck,
  TeiCommandMiddleware,
  TeiCommandSpec,
  TeiContext,
  TeiEventName,
  TeiEvents,
  TeiItem,
} from './types.js';

/**
 * How a content format reads into and writes out of the editor. `parse`
 * runs inside an update and should replace the root's children; `serialize`
 * runs inside a read.
 */
export interface TeiFormat {
  parse: (ctx: TeiContext, value: unknown) => void;
  serialize: (ctx: TeiContext) => unknown;
}

type EventLists = { [K in TeiEventName]: ReadonlyArray<NonNullable<TeiEvents[K]>> };

/**
 * Every registry the editor is built from. Each one is merged by key across
 * the extension graph, the app last, so anything an extension contributes
 * can be overridden — or removed with `null` — by whatever comes after it.
 */
export interface TeiCoreConfig {
  commands: Readonly<Record<string, TeiCommandSpec | null>>;
  active: Readonly<Record<string, TeiActiveCheck | null>>;
  items: Readonly<Record<string, TeiItem | null>>;
  messages: Readonly<Record<string, string>>;
  formats: Readonly<Record<string, TeiFormat | null>>;
  middleware: readonly TeiCommandMiddleware[];
  events: Partial<EventLists>;
}

function mergeCommands(
  base: TeiCoreConfig['commands'],
  overrides: TeiCoreConfig['commands'] | undefined,
): TeiCoreConfig['commands'] {
  if (!overrides) return base;
  const merged: Record<string, WithParent | null> = { ...base };
  for (const [name, spec] of Object.entries(overrides)) {
    const previous = base[name];
    merged[name] = spec && previous ? { ...spec, [PARENT]: previous } : spec;
  }
  return merged;
}

function mergeEvents(base: Partial<EventLists>, overrides: Partial<EventLists> | undefined) {
  if (!overrides) return base;
  const merged: Record<string, readonly unknown[]> = { ...base };
  for (const [name, handlers] of Object.entries(overrides)) {
    merged[name] = [...(merged[name] ?? []), ...(handlers ?? [])];
  }
  return merged as Partial<EventLists>;
}

export const TeiCoreExtension = defineExtension({
  name: '@teispace/teieditor/core',
  config: safeCast<TeiCoreConfig>({
    commands: {},
    active: {},
    items: {},
    messages: {},
    formats: { json: jsonFormat, text: textFormat },
    middleware: [],
    events: {},
  }),
  mergeConfig(config, overrides) {
    const merged = shallowMergeConfig(config, overrides);
    merged.commands = mergeCommands(config.commands, overrides.commands);
    merged.active = { ...config.active, ...overrides.active };
    merged.items = { ...config.items, ...overrides.items };
    merged.messages = { ...config.messages, ...overrides.messages };
    merged.formats = { ...config.formats, ...overrides.formats };
    merged.middleware = [...config.middleware, ...(overrides.middleware ?? [])];
    merged.events = mergeEvents(config.events, overrides.events);
    return merged;
  },
  build(lexical, config) {
    return { editor: new TeiEditor(lexical, config) };
  },
  register(lexical, config, state) {
    const { editor } = state.getOutput();
    const ctx: TeiContext = { editor, lexical };
    const { events } = config;
    const each = <K extends TeiEventName>(
      name: K,
      arg: Parameters<NonNullable<TeiEvents[K]>>[0],
    ) => {
      for (const handler of events[name] ?? []) (handler as (a: typeof arg) => void)(arg);
      editor.emit(name, arg);
    };
    return mergeRegister(
      lexical.registerUpdateListener(
        ({ editorState, prevEditorState, dirtyElements, dirtyLeaves, tags }) => {
          // The first commit fills the empty initial state; nothing changed yet.
          if (prevEditorState.isEmpty()) return;
          const docChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0;
          if (docChanged) each('onUpdate', { ...ctx, docChanged, tags });
          const selection = editorState._selection;
          const previous = prevEditorState._selection;
          if (selection === previous) return;
          if (!selection || !previous || !selection.is(previous)) each('onSelectionUpdate', ctx);
        },
      ),
      lexical.registerCommand(
        FOCUS_COMMAND,
        (event) => {
          each('onFocus', { ...ctx, event });
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      lexical.registerCommand(
        BLUR_COMMAND,
        (event) => {
          each('onBlur', { ...ctx, event });
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      () => each('onDestroy', ctx),
    );
  },
  afterRegistration(lexical, config, state) {
    const { editor } = state.getOutput();
    const ctx: TeiContext = { editor, lexical };
    for (const handler of config.events.onCreate ?? []) handler(ctx);
    editor.emit('onCreate', ctx);
    return () => {};
  },
});

/** The handle for a Lexical editor built with teieditor. */
export function getTeiEditor(lexical: LexicalEditor): TeiEditor {
  const editor = TeiEditor.of(lexical);
  if (!editor) {
    throw new Error('teieditor: this Lexical editor was not built with TeiCoreExtension');
  }
  return editor;
}
