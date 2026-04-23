import type { AdapterFactory, StorageAdapter } from './types';

export const localAdapter: AdapterFactory = ({ key }): StorageAdapter => ({
  get() {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  },
  set(value) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch (_e) {
      /* ignore */
    }
  },
  subscribe(cb) {
    if (typeof window === 'undefined') return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key && e.key !== key) return;
      cb(e.newValue);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
});
