import type { AdapterFactory, StorageAdapter } from './types';

export const sessionAdapter: AdapterFactory = ({ key }): StorageAdapter => ({
  get() {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  },
  set(value) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_e) {
      /* ignore */
    }
  },
});
