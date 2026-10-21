'use client';

import { useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { TeiEditor } from '../core/editor.js';
import { TeiEditorContext } from './context.js';

/** Equal when both are the same value, or objects/arrays with the same top-level entries. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

export interface UseEditorStateOptions<T> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** When two results count as the same, so no re-render. Default: shallow. */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Select something from the editor and re-render only when it changes:
 *
 * ```tsx
 * const { bold, canUndo } = useEditorState((editor) => ({
 *   bold: editor.isActive('bold'),
 *   canUndo: editor.can().undo(),
 * }));
 * ```
 *
 * The selector runs after every update and every change of editability,
 * and the component re-renders only if its result differs (shallowly, by
 * default). Keep it cheap and side-effect free.
 */
export function useEditorState<T>(
  selector: (editor: TeiEditor) => T,
  options: UseEditorStateOptions<T> = {},
): T {
  const contextEditor = useContext(TeiEditorContext);
  const editor = options.editor ?? contextEditor;
  if (!editor) {
    throw new Error(
      'teieditor: useEditorState needs an editor, from context or the `editor` option',
    );
  }
  const equal = options.equal ?? shallowEqual;

  // The last selection, and the inputs it came from, so getSnapshot returns
  // the same reference until something actually changed.
  const cache = useRef<{
    editor: TeiEditor;
    selector: typeof selector;
    version: number;
    value: T;
  } | null>(null);
  const version = useRef(0);

  const subscribe = useCallback(
    (notify: () => void) => {
      const bump = () => {
        version.current++;
        notify();
      };
      const offUpdate = editor.lexical.registerUpdateListener(bump);
      const offEditable = editor.lexical.registerEditableListener(bump);
      return () => {
        offUpdate();
        offEditable();
      };
    },
    [editor],
  );

  const getSnapshot = (): T => {
    const cached = cache.current;
    if (
      cached &&
      cached.editor === editor &&
      cached.version === version.current &&
      cached.selector === selector
    ) {
      return cached.value;
    }
    const next = selector(editor);
    const value =
      cached && cached.editor === editor && equal(cached.value, next) ? cached.value : next;
    cache.current = { editor, selector, version: version.current, value };
    return value;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
