'use client';

import { useCallback, useSyncExternalStore } from 'react';

interface ReadableSignal<T> {
  peek(): T;
  subscribe(fn: (value: T) => void): () => void;
}

/** A signal's value (an extension's storage), re-rendering when it changes. */
export function useSignal<T>(signal: ReadableSignal<T>): T;
export function useSignal<T>(signal: ReadableSignal<T> | undefined): T | undefined;
export function useSignal<T>(signal: ReadableSignal<T> | undefined): T | undefined {
  const subscribe = useCallback(
    (notify: () => void) => (signal ? signal.subscribe(() => notify()) : () => {}),
    [signal],
  );
  const get = () => signal?.peek();
  return useSyncExternalStore(subscribe, get, get);
}
