import type { CookieOptions } from '../core/types';

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
  /**
   * Called when a storage read or write throws.
   *
   * Every adapter swallows storage exceptions on purpose — Safari private mode,
   * sandboxed iframes, disabled cookies, and quota-exceeded must never break
   * theming. But swallowing them silently left users with no way to find out
   * why their theme stopped persisting. This is the diagnostic seam: failures
   * stay non-fatal, and now they are also observable.
   */
  onStorageError?: (error: unknown, context: { operation: 'get' | 'set'; key: string }) => void;
}

export type AdapterFactory = (opts: AdapterOptions) => StorageAdapter;
