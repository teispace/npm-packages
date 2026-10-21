'use client';

import { useEffect, useRef, useState } from 'react';
import type { TeiEditor } from '../core/editor.js';
import { hoverNow } from './hover-now.js';

/** How long hover UI stays after the pointer leaves, so it can travel to it. */
const LEAVE_DELAY = 200;

/** Hover state with a grace period, so the pointer can travel to the UI it shows. */
export function useHover<T>() {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    value,
    set: (next: T | null) => {
      clearTimeout(timer.current);
      setValue(next);
    },
    keep: () => clearTimeout(timer.current),
    leave: () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(null), LEAVE_DELAY);
    },
  };
}

/** Listen on the editor's root element, following it as it changes. */
export function useRootListener<K extends keyof HTMLElementEventMap>(
  editor: TeiEditor,
  type: K,
  listener: ((event: HTMLElementEventMap[K]) => void) | null,
) {
  const latest = useRef(listener);
  latest.current = listener;
  const on = listener !== null;
  useEffect(() => {
    if (!on) return;
    const handle = (event: HTMLElementEventMap[K]) => latest.current?.(event);
    let current: HTMLElement | null = null;
    const stop = editor.lexical.registerRootListener((root, previous) => {
      previous?.removeEventListener(type, handle);
      root?.addEventListener(type, handle);
      current = root;
      if (root && type === 'pointerover') hoverNow(root, handle as (event: PointerEvent) => void);
    });
    return () => {
      stop();
      current?.removeEventListener(type, handle);
    };
  }, [editor, type, on]);
}
