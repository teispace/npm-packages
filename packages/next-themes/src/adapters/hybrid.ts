import { cookieAdapter } from './cookie';
import { localAdapter } from './local';
import type { AdapterFactory, StorageAdapter } from './types';

/**
 * Hybrid adapter: cookie is authoritative on read (so the server can see
 * the same value the client just wrote and render zero-flash SSR), while
 * localStorage acts as a secondary mirror for cross-tab `storage` events
 * and as a fallback when the cookie is missing.
 *
 * Heals divergence on read. If the cookie is absent but localStorage has
 * a value (cookie expired, blocked by a privacy heuristic, lost in a CDN
 * rewrite, etc.), the value is written back to the cookie so the server
 * picks it up on the next request. This is what fixes the classic
 * "dark → light → dark" flicker: previously, cookie miss → script picks
 * default → mount reads localStorage → flips. Now the cookie is
 * eagerly repaired on first hydration so subsequent paints are stable.
 */
export const hybridAdapter: AdapterFactory = (opts): StorageAdapter => {
  const cookie = cookieAdapter(opts);
  const local = localAdapter(opts);
  return {
    get() {
      const c = cookie.get();
      if (c !== null) return c;
      const l = local.get();
      if (l !== null) {
        // Heal divergence: re-seed the cookie so server sees what client
        // remembers. Cheap; cookie writes are synchronous and dedupe at
        // the browser level.
        try {
          cookie.set(l);
        } catch (_e) {
          /* ignore — third-party cookie blocked, etc. */
        }
      }
      return l;
    },
    set(value) {
      // Cookie first, then mirror. If cookie write fails (rare —
      // sandboxed iframes, ITP), localStorage still keeps the choice
      // sticky for this client.
      try {
        cookie.set(value);
      } catch (_e) {
        /* ignore */
      }
      try {
        local.set(value);
      } catch (_e) {
        /* ignore */
      }
    },
    subscribe(cb) {
      return local.subscribe ? local.subscribe(cb) : () => {};
    },
  };
};
