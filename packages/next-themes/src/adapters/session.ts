import { hasSessionStorage } from '../core/env';
import type { AdapterFactory, StorageAdapter } from './types';

export const sessionAdapter: AdapterFactory = ({ key }): StorageAdapter => ({
  get() {
    if (!hasSessionStorage()) return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  },
  set(value) {
    if (!hasSessionStorage()) return;
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_e) {
      /* ignore */
    }
  },
});
