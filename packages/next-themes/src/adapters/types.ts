import type { CookieOptions, StorageMode } from '../core/types';

export interface StorageAdapter {
  /** Runtime read (post-hydration). */
  get(): string | null;
  /** Runtime write. */
  set(value: string): void;
  /** Optional: subscribe to cross-tab / external changes. */
  subscribe?(cb: (value: string | null) => void): () => void;
}

export interface AdapterOptions {
  key: string;
  cookie: Required<Pick<CookieOptions, 'name'>> & Omit<CookieOptions, 'name'>;
}

export type AdapterFactory = (opts: AdapterOptions) => StorageAdapter;

export function resolveAdapter(
  mode: StorageMode,
  opts: AdapterOptions,
  factories: Record<Exclude<StorageMode, 'none'>, AdapterFactory>,
): StorageAdapter {
  if (mode === 'none') {
    return { get: () => null, set: () => {} };
  }
  return factories[mode](opts);
}
