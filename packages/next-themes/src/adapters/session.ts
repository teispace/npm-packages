import { hasSessionStorage } from '../core/env';
import type { AdapterFactory, StorageAdapter } from './types';

export const sessionAdapter: AdapterFactory = ({ key, onStorageError }): StorageAdapter => ({
  get() {
    // Read from `globalThis` to match the `hasSessionStorage()` probe.
    if (!hasSessionStorage()) return null;
    try {
      return globalThis.sessionStorage.getItem(key);
    } catch (error) {
      onStorageError?.(error, { operation: 'get', key });
      return null;
    }
  },
  set(value) {
    if (!hasSessionStorage()) return;
    try {
      globalThis.sessionStorage.setItem(key, value);
    } catch (error) {
      onStorageError?.(error, { operation: 'set', key });
    }
  },
});
