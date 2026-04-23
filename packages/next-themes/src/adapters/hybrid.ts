import { cookieAdapter } from './cookie';
import { localAdapter } from './local';
import type { AdapterFactory, StorageAdapter } from './types';

/**
 * Hybrid adapter: cookie is authoritative on read (so the server can see the
 * same value the client just wrote and render zero-flash SSR), while
 * localStorage acts as a secondary mirror for cross-tab `storage` events.
 *
 * Writes go to both channels. If they disagree on read (rare, e.g. a tab was
 * open when the cookie expired), the cookie wins.
 */
export const hybridAdapter: AdapterFactory = (opts): StorageAdapter => {
  const cookie = cookieAdapter(opts);
  const local = localAdapter(opts);
  return {
    get() {
      return cookie.get() ?? local.get();
    },
    set(value) {
      cookie.set(value);
      local.set(value);
    },
    subscribe(cb) {
      return local.subscribe ? local.subscribe(cb) : () => {};
    },
  };
};
