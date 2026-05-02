/**
 * Environment probes that work on Node 25+, where `window === globalThis`
 * and `localStorage` exists as a partial Web Storage shim. The historical
 * `typeof window === 'undefined'` guard returns `'object'` on Node 25 and
 * the SSR path then calls `.getItem()` on a shim that does not implement
 * it, throwing on import (issue #389 upstream).
 *
 * The fix is to probe for the *capability* we actually need, not for the
 * presence of the global, and to do so behind try/catch so a misbehaving
 * shim still cannot crash module load or first render.
 */

/**
 * True iff we are in an environment where reading the DOM is safe — a real
 * browser or jsdom/happy-dom. Returns false on Node, Deno, Bun server, and
 * Node 25's globalThis-window.
 */
export function isDom(): boolean {
  try {
    return typeof document !== 'undefined' && typeof document.querySelector === 'function';
  } catch (_e) {
    return false;
  }
}

/**
 * True iff `window.matchMedia` is callable. On Node 25 `window` exists but
 * does not implement matchMedia, so this is the right probe for system
 * preference reads.
 */
export function hasMatchMedia(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof (window as { matchMedia?: unknown }).matchMedia === 'function'
    );
  } catch (_e) {
    return false;
  }
}

/**
 * True iff `localStorage` is a usable Web Storage instance — has both
 * `getItem` and `setItem` as functions. Node 25 ships a partial shim that
 * exposes the binding but not the methods; this probe rejects it.
 */
export function hasLocalStorage(): boolean {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return (
      !!ls &&
      typeof (ls as Storage).getItem === 'function' &&
      typeof (ls as Storage).setItem === 'function'
    );
  } catch (_e) {
    return false;
  }
}

/** As above, for sessionStorage. */
export function hasSessionStorage(): boolean {
  try {
    const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return (
      !!ss &&
      typeof (ss as Storage).getItem === 'function' &&
      typeof (ss as Storage).setItem === 'function'
    );
  } catch (_e) {
    return false;
  }
}

/**
 * True iff `document.cookie` is a usable string accessor. On Node 25 there
 * is no document, so this is just `isDom()` plus a sanity check that
 * `document.cookie` does not throw on read.
 */
export function hasDocumentCookie(): boolean {
  if (!isDom()) return false;
  try {
    return typeof document.cookie === 'string';
  } catch (_e) {
    return false;
  }
}

/**
 * True iff window-level event subscription is wired up — used for
 * `pageshow` / `storage` listeners. Node 25's globalThis exposes
 * addEventListener but the events never fire; that's fine, the listeners
 * are simply inert there.
 */
export function hasWindowEvents(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof (window as { addEventListener?: unknown }).addEventListener === 'function'
    );
  } catch (_e) {
    return false;
  }
}
