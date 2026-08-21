import { hasLocalStorage, hasWindowEvents } from '../core/env';
import type { AdapterFactory, StorageAdapter } from './types';

export const localAdapter: AdapterFactory = ({ key, onStorageError }): StorageAdapter => ({
  get() {
    // Probe the API rather than the global. Node 25 ships `window` as
    // `globalThis` with a partial `localStorage` shim, so `typeof window`
    // is "object" but `getItem` would throw. `hasLocalStorage()` checks
    // the actual capability. Read from `globalThis` to match that probe —
    // it covers worker-like environments where Web Storage exists but
    // `window` does not.
    if (!hasLocalStorage()) return null;
    try {
      return globalThis.localStorage.getItem(key);
    } catch (error) {
      onStorageError?.(error, { operation: 'get', key });
      return null;
    }
  },
  set(value) {
    if (!hasLocalStorage()) return;
    try {
      globalThis.localStorage.setItem(key, value);
    } catch (error) {
      // Non-fatal by design (quota, sandboxed iframe, private mode) — but now
      // reportable so a user can find out why persistence stopped working.
      onStorageError?.(error, { operation: 'set', key });
    }
  },
  subscribe(cb) {
    if (!hasWindowEvents()) return () => {};
    const handler = (e: StorageEvent): void => {
      if (e.key && e.key !== key) return;
      cb(e.newValue);
    };
    try {
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    } catch (_e) {
      return () => {};
    }
  },
});
