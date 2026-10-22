'use client';

import { ReactExtension } from '@lexical/react/ReactExtension';
import { ReactProviderExtension } from '@lexical/react/ReactProviderExtension';
import { configExtension, HISTORY_MERGE_TAG } from 'lexical';
import { type DependencyList, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createTeiEditor, type TeiEditorOptions } from '../core/create.js';
import type { TeiEditor } from '../core/editor.js';

/**
 * Lexical's React host, with the content-editable left to `<EditorContent>`
 * so the app decides where the document goes.
 */
const ReactHost = [
  ReactProviderExtension,
  configExtension(ReactExtension, { contentEditable: null }),
];

/** Build an editor for React: `createTeiEditor` plus Lexical's React host. */
export function createReactTeiEditor(options: TeiEditorOptions): TeiEditor {
  return createTeiEditor({ ...options, extensions: [ReactHost, ...options.extensions] });
}

/**
 * Create an editor that lives as long as the component, or until `deps`
 * change. Unlike hooks that return `null` until the client renders, it
 * returns an editor on the first render, server included, so UI that reads
 * from it never needs a null check.
 *
 * Options are read once; to react to a later change, list it in `deps`
 * (which rebuilds the editor), or change it live through a command or
 * `setExtensionOptions`.
 */
export function useTeiEditor(options: TeiEditorOptions, deps: DependencyList = []): TeiEditor {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [state, setState] = useState(() => ({ editor: create(options), deps }));

  let { editor } = state;
  if (!sameDeps(state.deps, deps)) {
    editor = create(optionsRef.current);
    setState({ editor, deps });
  }

  // HTML content goes in once the component mounts, before the browser
  // paints (see `create`).
  useMountLayoutEffect(() => {
    const { content, contentFormat } = optionsRef.current;
    if (!readsHTML(content, contentFormat) || filled.has(editor)) return;
    filled.add(editor);
    editor.setContent(content, 'html', { tag: HISTORY_MERGE_TAG });
  }, [editor]);

  useEffect(() => {
    mounts.set(editor, (mounts.get(editor) ?? 0) + 1);
    return () => {
      mounts.set(editor, (mounts.get(editor) ?? 1) - 1);
      // Destroy after unmount, not during it: StrictMode unmounts and
      // remounts every component once in development, synchronously, so by
      // the time this runs a remount has counted itself back in.
      queueMicrotask(() => {
        if (!mounts.get(editor)) editor.destroy();
      });
    };
  }, [editor]);

  return editor;
}

const readsHTML = (content: unknown, format: string | undefined) =>
  content !== undefined &&
  content !== null &&
  (format ?? (typeof content === 'string' ? 'html' : 'json')) === 'html';

/**
 * JSON, Markdown and text content go in at once, server included. HTML
 * needs a DOM to read, which a server does not have: there the document
 * starts empty, and so it does in the browser's first render too, so
 * hydration sees what the server rendered. The content follows on mount.
 */
function create(options: TeiEditorOptions): TeiEditor {
  return createReactTeiEditor(
    readsHTML(options.content, options.contentFormat)
      ? { ...options, content: undefined }
      : options,
  );
}

/** Editors whose initial content is in (StrictMode runs effects twice). */
const filled = new WeakSet<TeiEditor>();

// `useLayoutEffect` warns on a server before React 19; there it never runs anyway.
const useMountLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** How many mounted components use each editor. */
const mounts = new WeakMap<TeiEditor, number>();

function sameDeps(a: DependencyList, b: DependencyList): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}
