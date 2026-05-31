import { hasSessionStorage } from '../core/env';
import type { AdapterFactory, StorageAdapter } from './types';

export const sessionAdapter: AdapterFactory = ({ key }): StorageAdapter => ({
  get() {
    // Read from `globalThis` to match the `hasSessionStorage()` probe.
    if (!hasSessionStorage()) return null;
    try {
      return globalThis.sessionStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  },
  set(value) {
    if (!hasSessionStorage()) return;
    try {
      globalThis.sessionStorage.setItem(key, value);
    } catch (_e) {
      /* ignore */
    }
  },
});
