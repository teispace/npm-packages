import { type Signal, signal } from '@lexical/extension';
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, mergeRegister } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $matchAnyTypeahead,
  sameTypeahead,
  type TypeaheadMatch,
  type TypeaheadPattern,
} from '../../core/typeahead.js';
import { hasUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import { spinner } from '../../icons/index.js';

export type { TypeaheadMatch, TypeaheadPattern } from '../../core/typeahead.js';
export {
  $matchAnyTypeahead,
  $matchTypeahead,
  $replaceTypeahead,
  sameTypeahead,
  typeaheadRange,
} from '../../core/typeahead.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Put the open list's highlighted option (or the one at `index`) in place of its trigger. */
    chooseTypeahead: [index?: number];
    /** Close the open list; it stays closed for this trigger. */
    closeTypeahead: [];
  }
}

/** A row in a typeahead list. */
export interface TypeaheadOption {
  /** Unique in its list. */
  id: string;
  /** The row's text. Plain text, never read as HTML. */
  label: string;
  /** A second, quieter line. */
  description?: string;
  /** A character drawn large before the label: an emoji. */
  glyph?: string;
  /** A picture before the label (an avatar); drawn only if it is a safe image URL. */
  image?: string;
  /** An icon's name, for a row with neither. */
  icon?: string;
}

export interface TypeaheadSearchContext {
  /** Aborts when the query changes or the list closes: pass it to `fetch`. */
  signal: AbortSignal;
  editor: TeiEditor;
  trigger: string;
}

/**
 * Something a trigger looks up: emoji after `:`, people after `@`. An
 * extension adds its own with {@link addTypeaheadSources}.
 */
export interface TypeaheadSource<O extends TypeaheadOption = TypeaheadOption>
  extends TypeaheadPattern {
  /** Unique: which source an open list is for. */
  id: string;
  /** The list's accessible name: a message id or the text itself. */
  label: string;
  /** The options for a query, now or later. Ranked; the list shows them in order. */
  search: (query: string, context: TypeaheadSearchContext) => readonly O[] | Promise<readonly O[]>;
  /** Put the pick in place of the match. Runs inside an update. */
  select: (option: O, match: TypeaheadMatch, editor: TeiEditor) => void;
  /** Wait this long after the last key before searching, in ms. Default 0. */
  debounce?: number;
  /** What an empty result shows: a message id, or `null` to close the list. Default "No matches". */
  empty?: string | null;
}

/** The open list: its source, the trigger it is for, and what the search found. */
export interface TypeaheadState {
  source: string;
  match: TypeaheadMatch;
  options: readonly TypeaheadOption[];
  /** A search is running; `options` may be the previous query's. */
  loading: boolean;
  /** The highlighted option's index, `-1` with none. */
  highlighted: number;
  /** Whether a list shows: options, a search running, or an empty message to give. */
  visible: boolean;
}

export interface TypeaheadStorage {
  /** The open list, or `null`. Lists render from it; set `highlighted` on hover. */
  readonly state: Signal<TypeaheadState | null>;
  /** The UIs that draw the list. With none, keys pass through and nothing shows. */
  readonly ui: UiRequest;
  /** Every source, by id, as the providers give them now. */
  sources(): Map<string, TypeaheadSource>;
  /** @internal Who adds sources. */
  readonly providers: Set<() => readonly TypeaheadSource[]>;
  /** @internal The trigger the user closed the list for (`key:offset`). */
  dismissed: string | null;
  /** @internal Look again at the caret. */
  refresh(): void;
  /** @internal Stop the running search. */
  cancel(): void;
}

export const TYPEAHEAD_EXTENSION = '@teispace/teieditor/typeahead';

/** The editor's typeahead storage, if the extension is installed. */
export function getTypeahead(editor: TeiEditor): TypeaheadStorage | undefined {
  return editor.extension(Typeahead)?.output.storage as TypeaheadStorage | undefined;
}

/**
 * Add sources, given by a function so they can follow live options. Returns
 * the clean-up. Call it from an extension's `register`.
 */
export function addTypeaheadSources(
  editor: TeiEditor,
  provide: () => readonly TypeaheadSource[],
): () => void {
  const storage = getTypeahead(editor);
  if (!storage) return () => {};
  storage.providers.add(provide);
  storage.refresh();
  return () => {
    storage.providers.delete(provide);
    storage.refresh();
  };
}

/** Move the highlight, wrapping at the ends. */
export function moveTypeaheadHighlight(storage: TypeaheadStorage, by: number): void {
  const state = storage.state.peek();
  const count = state?.options.length ?? 0;
  if (!state || count === 0) return;
  const from = state.highlighted < 0 ? (by > 0 ? -1 : 0) : state.highlighted;
  storage.state.value = { ...state, highlighted: (((from + by) % count) + count) % count };
}

/** Highlight the option at `index` (a pointer over it). */
export function setTypeaheadHighlight(storage: TypeaheadStorage, index: number): void {
  const state = storage.state.peek();
  if (state && state.highlighted !== index) storage.state.value = { ...state, highlighted: index };
}

const isVisible = (source: TypeaheadSource, state: Omit<TypeaheadState, 'visible'>) =>
  state.options.length > 0 ||
  state.loading ||
  // With nothing found, a query with a space in it is prose: close.
  (source.empty !== null && !/\s/.test(state.match.query));

/**
 * The typeahead engine: watches the text before the caret for any
 * source's trigger, runs that source's search (debounced, the stale one
 * aborted), and holds the open list in a signal for a UI to draw. With a UI
 * mounted, ↑/↓ move, Enter or Tab pick and Escape closes; focus never leaves
 * the document. Nothing opens while an IME is composing. Emoji and Mention
 * build on it; `<TypeaheadMenu>` draws it in React.
 */
export const Typeahead = defineTeiExtension({
  name: TYPEAHEAD_EXTENSION,
  storage: (): TypeaheadStorage => {
    const providers = new Set<() => readonly TypeaheadSource[]>();
    return {
      state: signal<TypeaheadState | null>(null),
      ui: uiRequest(),
      providers,
      sources: () => {
        const all = new Map<string, TypeaheadSource>();
        for (const provide of providers) for (const source of provide()) all.set(source.id, source);
        return all;
      },
      dismissed: null,
      // Both replaced in `register`, where the editor runs.
      refresh: () => {},
      cancel: () => {},
    };
  },
  icons: { spinner },
  messages: {
    'typeahead.empty': 'No matches',
    'typeahead.loading': 'Searching…',
  },
  commands: {
    chooseTypeahead: {
      run: ({ storage, editor }, index?: number) => {
        const state = storage.state.peek();
        const source = state && storage.sources().get(state.source);
        const option = state?.options[index ?? state.highlighted];
        if (!state || !source || !option) return false;
        source.select(option, state.match, editor);
      },
      can: ({ storage }) => (storage.state.peek()?.options.length ?? 0) > 0,
    },
    closeTypeahead: {
      run: ({ storage }) => {
        const state = storage.state.peek();
        if (!state) return false;
        storage.dismissed = at(state.match);
        storage.cancel();
        storage.state.value = null;
      },
      can: ({ storage }) => storage.state.peek() !== null,
    },
  },
  register: ({ lexical, editor, storage }) => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      clearTimeout(timer);
      controller?.abort();
      controller = null;
    };
    storage.cancel = cancel;

    const set = (source: TypeaheadSource, next: Omit<TypeaheadState, 'visible'>) => {
      storage.state.value = { ...next, visible: isVisible(source, next) };
    };

    const search = (
      source: TypeaheadSource,
      match: TypeaheadMatch,
      previous: TypeaheadState | null,
    ) => {
      cancel();
      const own = new AbortController();
      controller = own;
      const kept = previous?.source === source.id ? previous.options : [];
      const finish = (options: readonly TypeaheadOption[]) => {
        if (own.signal.aborted) return;
        const current = storage.state.peek();
        if (!current || current.source !== source.id) return;
        set(source, {
          ...current,
          options,
          loading: false,
          highlighted: options.length ? 0 : -1,
        });
      };
      const run = () => {
        let found: readonly TypeaheadOption[] | Promise<readonly TypeaheadOption[]>;
        try {
          found = source.search(match.query, {
            signal: own.signal,
            editor,
            trigger: match.trigger,
          });
        } catch (error) {
          console.error(error);
          found = [];
        }
        if (Array.isArray(found) || !('then' in found)) finish(found as readonly TypeaheadOption[]);
        else
          found.then(finish, (error: unknown) => {
            if (!own.signal.aborted) console.error(error);
            finish([]);
          });
      };
      const wait = source.debounce ?? 0;
      set(source, {
        source: source.id,
        match,
        options: kept,
        loading: true,
        highlighted: kept.length ? Math.min(previous?.highlighted ?? 0, kept.length - 1) : -1,
      });
      if (wait > 0) timer = setTimeout(run, wait);
      else run();
    };

    const refresh = () => {
      const all = [...storage.sources().values()];
      const found =
        all.length && lexical.isEditable()
          ? lexical.getEditorState().read(() => $matchAnyTypeahead(all), { editor: lexical })
          : null;
      const previous = storage.state.peek();
      if (!found) {
        storage.dismissed = null;
        if (previous) {
          cancel();
          storage.state.value = null;
        }
        return;
      }
      const [index, match] = found;
      const source = all[index] as TypeaheadSource;
      if (storage.dismissed === at(match)) {
        if (previous) {
          cancel();
          storage.state.value = null;
        }
        return;
      }
      if (previous?.source === source.id && sameTypeahead(previous.match, match)) return;
      if (previous?.source === source.id && previous.match.query === match.query) {
        set(source, { ...previous, match });
        return;
      }
      search(source, match, previous);
    };
    storage.refresh = refresh;

    const onKey = (event: KeyboardEvent): boolean => {
      const state = storage.state.peek();
      if (!state?.visible || !hasUi(storage.ui) || event.isComposing) return false;
      const take = () => {
        event.preventDefault();
        return true;
      };
      const plain = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          if (!plain || state.options.length === 0) return false;
          moveTypeaheadHighlight(storage, event.key === 'ArrowDown' ? 1 : -1);
          return take();
        case 'Enter':
        case 'Tab':
          if (!plain || state.highlighted < 0 || !state.options[state.highlighted]) return false;
          editor.commands.chooseTypeahead();
          return take();
        case 'Escape':
          editor.commands.closeTypeahead();
          return take();
      }
      return false;
    };

    return mergeRegister(
      lexical.registerUpdateListener(refresh),
      lexical.registerEditableListener(refresh),
      lexical.registerCommand(KEY_DOWN_COMMAND, onKey, COMMAND_PRIORITY_HIGH),
      () => {
        cancel();
        storage.state.value = null;
      },
    );
  },
});

/** Where a trigger is, to remember one the user closed. */
const at = (match: TypeaheadMatch) => `${match.key}:${match.offset}`;
