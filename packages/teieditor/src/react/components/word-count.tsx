'use client';

import {
  type ComponentPropsWithoutRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import {
  CharacterCount,
  type CharacterStats,
  getCharacterCount,
} from '../../extensions/character-count/index.js';
import { useOptionalEditor } from '../context.js';
import { cx } from '../ui/context.js';

export type WordCountStat = keyof CharacterStats;

/** Where the count stands against the limit. */
export type LimitState = 'under' | 'near' | 'reached' | 'over';

export interface WordCountProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Which counts to show, in order. Default words and characters. */
  show?: readonly WordCountStat[];
  /** Number format and plural rules; default the extension's `locale`. */
  locale?: string;
  /**
   * What screen readers hear without asking: `'limit'` (default) only when
   * the limit comes near, is reached or passed; `'pause'` the counts too,
   * once typing pauses; `'off'` nothing.
   */
  announce?: 'limit' | 'pause' | 'off';
  /** How close to the limit counts as near, as a share of it. Default 0.1. */
  nearAt?: number;
}

const ZERO: CharacterStats = {
  characters: 0,
  charactersNoSpaces: 0,
  words: 0,
  paragraphs: 0,
  readingMinutes: 0,
};

/** A signal's value, following it. */
function useSignal<T>(
  signal: { peek(): T; subscribe(fn: (value: T) => void): () => void } | undefined,
  fallback: T,
): T {
  return useSyncExternalStore(
    (notify) => signal?.subscribe(notify) ?? (() => {}),
    () => (signal ? signal.peek() : fallback),
    () => (signal ? signal.peek() : fallback),
  );
}

/** Where `count` stands against `limit`. */
export function limitState(count: number, limit: number | null, nearAt = 0.1): LimitState {
  if (limit === null) return 'under';
  if (count > limit) return 'over';
  if (count === limit) return 'reached';
  return limit - count <= Math.max(1, Math.ceil(limit * nearAt)) ? 'near' : 'under';
}

/**
 * The document's counts in a footer line: words and characters (or what
 * `show` asks for), the selection's while there is one, and `n / limit`
 * with a warning colour near the limit. Screen readers are told when the
 * limit comes near, not on every key. Needs the `CharacterCount` extension.
 *
 * ```tsx
 * <Editor slots={{ footer: <WordCount /> }} />
 * ```
 */
export function WordCount({
  editor: editorProp,
  show = ['words', 'characters'],
  locale: localeProp,
  announce = 'limit',
  nearAt = 0.1,
  className,
  ...rest
}: WordCountProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <WordCount> needs an `editor` prop or a provider');
  const storage = getCharacterCount(editor);
  const stats = useSignal(storage?.stats, ZERO);
  const selection = useSignal(storage?.selection, null);
  // Options can change while the editor runs: follow their signals.
  const options = editor.extension(CharacterCount)?.output.options;
  const limit = useSignal(options?.limit, null);
  const mode = useSignal(options?.mode, 'characters');
  const optionLocale = useSignal(options?.locale, undefined);
  const locale = localeProp ?? optionLocale;
  const format = useMemo(() => {
    const number = new Intl.NumberFormat(locale);
    const rules = new Intl.PluralRules(locale);
    return (stat: string, count: number) => {
      const id = `wordCount.${stat}.${rules.select(count)}`;
      const message = editor.t(id) === id ? `wordCount.${stat}.other` : id;
      return editor.t(message, { count: number.format(count) });
    };
  }, [editor, locale]);
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const count = mode === 'words' ? stats.words : stats.characters;
  // A selection is told in the unit the limit counts, else in words.
  const selected = limit !== null && mode === 'characters' ? 'characters' : 'words';
  const state = limitState(count, limit, nearAt);
  const parts = show.map((stat) => ({ stat, text: format(stat, stats[stat]) }));
  const limitText =
    limit === null
      ? null
      : editor.t('wordCount.limit', { count: number.format(count), limit: number.format(limit) });
  const limitSpoken =
    limit === null
      ? null
      : editor.t(`wordCount.limit.${mode}`, {
          count: number.format(count),
          limit: number.format(limit),
        });

  // What the live region says: only on a change of limit state, or after a pause.
  const [spoken, setSpoken] = useState('');
  const lastState = useRef<LimitState>(state);
  useEffect(() => {
    if (announce === 'off' || limit === null || state === lastState.current) {
      lastState.current = state;
      return;
    }
    lastState.current = state;
    setSpoken(
      state === 'near'
        ? editor.t('wordCount.near', { count: number.format(limit - count) })
        : state === 'reached'
          ? editor.t('wordCount.reached')
          : state === 'over'
            ? editor.t('wordCount.over', { count: number.format(count - limit) })
            : '',
    );
  }, [announce, editor, state, limit, count, number]);
  const summary = [...parts.map((p) => p.text), limitSpoken].filter(Boolean).join(', ');
  useEffect(() => {
    if (announce !== 'pause') return;
    const timer = setTimeout(() => setSpoken(summary), 1500);
    return () => clearTimeout(timer);
  }, [announce, summary]);

  return (
    <div
      {...rest}
      className={cx('tei-portal', 'tei-word-count', className)}
      role="group"
      aria-label={editor.t('wordCount.label')}
      data-tei-word-count=""
      data-state={limit === null ? undefined : state}
    >
      {selection && (
        <span className="tei-word-count-part" data-stat="selection">
          {editor.t('wordCount.selected', {
            count: format(selected, selection[selected]),
          })}
        </span>
      )}
      {parts.map(({ stat, text }) => (
        <span key={stat} className="tei-word-count-part" data-stat={stat}>
          {text}
        </span>
      ))}
      {limitText && (
        <span className="tei-word-count-limit" data-state={state}>
          <span aria-hidden="true">{limitText}</span>
          <span className="tei-sr-only">{limitSpoken}</span>
        </span>
      )}
      <span className="tei-sr-only" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
    </div>
  );
}
