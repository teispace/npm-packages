import type { StorageAdapter } from '../adapters/types';
import {
  applyAttribute,
  applyColorScheme,
  applyThemeColor,
  disableTransition,
  getSystemTheme,
  isAttributeAlreadyApplied,
  resolveTarget,
  subscribeSystem,
} from './dom';
import { hasWindowEvents, isDom } from './env';
import { normalizeSelection } from './resolve';
import type {
  Attribute,
  Listener,
  SetThemeAction,
  SetThemeOptions,
  ThemeState,
  TransitionConfig,
} from './types';
import { resolveTransition, startViewTransition } from './view-transition';

export interface StoreOptions {
  themes: string[];
  defaultTheme: string;
  enableSystem: boolean;
  forcedTheme: string | null;
  initialTheme: string | null;
  followSystem: boolean;
  attribute: Attribute | Attribute[];
  value: Record<string, string> | null;
  enableColorScheme: boolean;
  themeColor: string | Record<string, string> | null;
  disableTransitionOnChange: boolean | string;
  respectReducedMotion: boolean;
  target: string;
  storage: StorageAdapter;
  transition?: TransitionConfig;
  onChange?: (theme: string, resolvedTheme: string) => void;
  /**
   * CSP nonce stamped on any `<style>` the store has to fall back to when the
   * engine lacks constructable stylesheets.
   */
  nonce?: string;
}

/**
 * Subset of `StoreOptions` that the host provider may legitimately change at
 * runtime. Storage backend, attribute, themes list, and target selector are
 * intentionally *not* updateable: they are baked into the inline anti-FOUC
 * script at SSR and changing them post-hydration would create a mismatch.
 *
 * `forcedTheme` is the headline use case — App Router users toggle it per
 * route group (e.g. always-dark marketing pages, always-light dashboards).
 */
export interface UpdatableStoreOptions {
  forcedTheme?: string | null;
  followSystem?: boolean;
  value?: Record<string, string> | null;
  themeColor?: string | Record<string, string> | null;
  transition?: TransitionConfig;
  onChange?: (theme: string, resolvedTheme: string) => void;
  disableTransitionOnChange?: boolean | string;
  respectReducedMotion?: boolean;
}

export interface ThemeStore {
  getState: () => ThemeState;
  /**
   * Stable seeded state for SSR / the hydration render. Pass to
   * `useSyncExternalStore`'s third argument so the server render reflects the
   * cookie-seeded theme rather than an empty placeholder.
   */
  getServerSnapshot: () => ThemeState;
  subscribe: (l: Listener) => () => void;
  setTheme: (theme: SetThemeAction, options?: SetThemeOptions) => void;
  /** Start side-effect subscriptions (system/storage). Idempotent. */
  mount: () => void;
  /** Tear down subscriptions. */
  unmount: () => void;
  /** Sync runtime-mutable provider props into the store. */
  update: (opts: UpdatableStoreOptions) => void;
}

/** Shallow value-equality for `Record<string,string> | null` maps. */
function recordEqual(a: Record<string, string> | null, b: Record<string, string> | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/** Value-equality for the `themeColor` prop (string, record, or null). */
function themeColorEqual(
  a: string | Record<string, string> | null,
  b: string | Record<string, string> | null,
): boolean {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string') return false;
  return recordEqual(a, b);
}

/**
 * Which store last wrote its theme to each element. Several providers can
 * target the same element (nested providers, a page-level `forcedTheme`
 * provider inside the root one), and each guards it against drift. Only the
 * last writer restores the theme, so two guards never fight over the element.
 */
const owners = new WeakMap<Element, object>();

/**
 * How many restorations a guard may make inside {@link GUARD_WINDOW_MS}
 * before it gives up. Something rewriting the element in a loop would
 * otherwise keep the guard — and the page — busy forever.
 */
const GUARD_BUDGET = 20;
const GUARD_WINDOW_MS = 1000;

export function createStore(opts: StoreOptions): ThemeStore {
  // Frozen-at-construction options. Changing any of these would require
  // rebuilding the inline anti-FOUC script (which is already serialized into
  // the document) so we deliberately do not surface setters for them.
  const {
    themes,
    defaultTheme,
    enableSystem,
    initialTheme,
    attribute,
    enableColorScheme,
    target,
    storage,
    nonce,
  } = opts;

  // Mutable through `update()`. Using `let` so `setTheme`, `apply`, and the
  // event handlers below all read the latest value when the host provider
  // re-renders with new props.
  let forcedTheme: string | null = opts.forcedTheme;
  let followSystem: boolean = opts.followSystem;
  let value: Record<string, string> | null = opts.value;
  let themeColor: string | Record<string, string> | null = opts.themeColor;
  let disableTransitionOnChange: boolean | string = opts.disableTransitionOnChange;
  let respectReducedMotion: boolean = opts.respectReducedMotion;
  let transition: TransitionConfig | undefined = opts.transition;
  let onChange: ((theme: string, resolvedTheme: string) => void) | undefined = opts.onChange;

  const allThemes = enableSystem ? [...themes, 'system'] : themes;

  function readStored(): string | null {
    const v = storage.get();
    if (!v) return null;
    if (v === 'system' && enableSystem) return v;
    return themes.includes(v) ? v : null;
  }

  // The OS preference. Kept current by the media-query listener once mounted,
  // so a theme switch never has to re-evaluate `matchMedia`.
  let systemTheme: 'light' | 'dark' = 'light';
  let systemSubscribed = false;
  function currentSystemTheme(): 'light' | 'dark' {
    if (!systemSubscribed) systemTheme = getSystemTheme();
    return systemTheme;
  }

  function compute(stored: string | null, system: 'light' | 'dark'): ThemeState {
    let rawTheme: string;
    if (forcedTheme) {
      rawTheme = forcedTheme;
    } else if (followSystem && enableSystem) {
      rawTheme = 'system';
    } else {
      rawTheme = stored ?? initialTheme ?? defaultTheme;
    }
    const theme = normalizeSelection(rawTheme, themes, defaultTheme, enableSystem);
    const resolved = theme === 'system' ? system : theme;
    return {
      theme,
      resolvedTheme: resolved,
      systemTheme: enableSystem ? system : null,
      forcedTheme: forcedTheme ?? null,
      themes: allThemes,
    };
  }

  function initial(): ThemeState {
    return compute(readStored(), currentSystemTheme());
  }

  // The state the server rendered, for `useSyncExternalStore`'s server-snapshot
  // slot. It must be computed the way the server computes it — from props
  // alone, with no storage and the server's `'light'` system fallback — and
  // NOT from this browser's storage: React hydrates against this value, so a
  // client-side read here (say a localStorage `dark` the server never saw)
  // made the hydration render disagree with the server HTML. React then
  // re-renders with the live snapshot after hydration, which is the correct,
  // warning-free way to reveal a client-only value. Seeding the provider with
  // `initialTheme` from the server cookie makes the two agree from the start.
  // Computed once: React requires a referentially stable snapshot.
  const serverState: ThemeState = compute(null, 'light');
  let state: ThemeState = initial();
  let previousApplied: string | null = null;
  const listeners = new Set<Listener>();
  let mounted = false;
  let unsubSystem: (() => void) | null = null;
  let unsubStorage: (() => void) | null = null;
  let unsubPageShow: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  const ownerToken = {};

  function emit(): void {
    for (const l of listeners) l(state);
  }

  function apply(next: ThemeState, skipTransitionDisable = false): void {
    if (!isDom()) return;
    const el = resolveTarget(target);
    const applied =
      value && value[next.resolvedTheme] != null ? value[next.resolvedTheme] : next.resolvedTheme;

    // Compare against current DOM state so a no-op apply does not inject
    // the disable-transition <style> needlessly. This is the silent flicker
    // source — every re-apply was inserting + removing a style tag, even
    // when the resolved theme had not changed.
    const domUnchanged =
      previousApplied === applied && isAttributeAlreadyApplied(el, attribute, applied);

    let restore: (() => void) | null = null;
    if (!skipTransitionDisable && disableTransitionOnChange && !domUnchanged) {
      restore = disableTransition(disableTransitionOnChange, respectReducedMotion, nonce);
    }

    if (!domUnchanged) {
      applyAttribute(
        el,
        attribute,
        next.resolvedTheme,
        previousApplied,
        value ?? undefined,
        allThemes,
      );
    }
    if (enableColorScheme) applyColorScheme(el, next.resolvedTheme);
    applyThemeColor(next.theme, next.resolvedTheme, themeColor ?? undefined);

    previousApplied = applied;
    owners.set(el, ownerToken);
    restore?.();
  }

  function setState(next: ThemeState, skipTransitionDisable = false): void {
    const prev = state;
    // What actually paints is driven by `theme`/`resolvedTheme`. `systemTheme`
    // is user-visible (consumers may surface "OS prefers dark") but does not
    // by itself change the DOM, so a bare systemTheme change should emit
    // without re-applying or firing onChange.
    const domChanged = prev.theme !== next.theme || prev.resolvedTheme !== next.resolvedTheme;
    const emitChanged = domChanged || prev.systemTheme !== next.systemTheme;
    const forcedChanged = prev.forcedTheme !== next.forcedTheme;
    state = next;
    if (domChanged) apply(next, skipTransitionDisable);
    if (emitChanged || forcedChanged) emit();
    if (domChanged) onChange?.(next.theme, next.resolvedTheme);
  }

  function setTheme(action: SetThemeAction, options?: SetThemeOptions): void {
    if (forcedTheme) return;
    // Mirror React's SetStateAction: when given an updater, resolve against
    // the currently-selected theme so consumers can do `setTheme(p => ...)`.
    const raw = typeof action === 'function' ? action(state.theme) : action;
    const isSys = raw === 'system' && enableSystem;
    // Reject unknown values — `'system'` is only valid when `enableSystem`.
    if (!isSys && !themes.includes(raw)) return;
    const theme = normalizeSelection(raw, themes, defaultTheme, enableSystem);

    const doApply = (insideViewTransition: boolean): void => {
      storage.set(theme);
      const systemTheme = currentSystemTheme();
      const resolved = theme === 'system' ? systemTheme : theme;
      // When a View Transition is animating this change, suppress the
      // `disableTransitionOnChange` <style>: that style sets
      // `transition:none!important` on every element and would cancel the very
      // animation the View Transition is performing. VT supersedes it.
      setState(
        {
          ...state,
          theme,
          resolvedTheme: resolved,
          systemTheme: enableSystem ? systemTheme : null,
        },
        insideViewTransition,
      );
    };

    const effective = options?.transition !== undefined ? options.transition : transition;
    // Resolve the concrete target theme up front so it can be stamped as a
    // view-transition type (`types: ['theme', 'dark']`), letting consumers write
    // direction-aware CSS without reading any DOM attribute.
    const targetResolved = theme === 'system' ? currentSystemTheme() : theme;
    const resolvedVt = resolveTransition(effective, respectReducedMotion, targetResolved);
    if (resolvedVt) {
      startViewTransition(() => doApply(true), resolvedVt, nonce);
    } else {
      doApply(false);
    }
  }

  function onSystemChange(next: 'light' | 'dark'): void {
    systemTheme = next;
    // An OS light/dark flip only repaints when the *selected* theme is
    // `system`. setState() applies to the DOM only when resolvedTheme
    // changes, so for a concrete 'light'/'dark' selection this updates the
    // user-visible systemTheme (one emit) without rewriting the DOM.
    setState({
      ...state,
      systemTheme: next,
      resolvedTheme: state.theme === 'system' ? next : state.resolvedTheme,
    });
  }

  function onStorageChange(raw: string | null): void {
    if (forcedTheme) return;
    const nextTheme = normalizeSelection(raw, themes, defaultTheme, enableSystem);
    const systemTheme = currentSystemTheme();
    const resolved = nextTheme === 'system' ? systemTheme : nextTheme;
    setState({
      ...state,
      theme: nextTheme,
      resolvedTheme: resolved,
      systemTheme: enableSystem ? systemTheme : null,
    });
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
    // Re-read storage on hydration. The inline script already painted the
    // DOM, so on first mount we MUST skip the transition-disable <style>:
    // the script handled FOUC suppression already, and re-injecting a
    // style here is itself a flicker source.
    const fresh = initial();
    if (fresh.theme !== state.theme || fresh.resolvedTheme !== state.resolvedTheme) {
      setState(fresh, true);
    } else {
      // State matches; just ensure the DOM does too (CSR-only path where
      // the script never ran).
      apply(state, true);
    }
    if (enableSystem) {
      unsubSystem = subscribeSystem(onSystemChange);
      // The listener only reports changes, so take a fresh reading now; from
      // here on the cached value is authoritative.
      systemTheme = getSystemTheme();
      systemSubscribed = true;
    }
    observer = guardDom();
    if (storage.subscribe) {
      unsubStorage = storage.subscribe(onStorageChange);
    }
    // bfcache: when the page is restored from back/forward cache, storage
    // may have changed in another tab. Re-read and reconcile.
    if (hasWindowEvents()) {
      const onPageShow = (e: PageTransitionEvent): void => {
        if (!e.persisted) return;
        // A frozen page can miss the media-query change event entirely.
        if (systemSubscribed) systemTheme = getSystemTheme();
        const next = initial();
        if (next.theme !== state.theme || next.resolvedTheme !== state.resolvedTheme) {
          setState(next, true);
        }
      };
      try {
        window.addEventListener('pageshow', onPageShow);
        unsubPageShow = () => window.removeEventListener('pageshow', onPageShow);
      } catch (_e) {
        unsubPageShow = null;
      }
    }
  }

  /**
   * Re-apply the theme when something else strips it from the target. The
   * classic case is React re-rendering `<html className={…}>` on a client
   * navigation: it rewrites the whole `class` attribute and silently drops the
   * theme class (upstream next-themes #351, #242). Only the attributes the
   * theme owns are observed, and the callback is a no-op unless the DOM has
   * actually drifted, so our own writes never loop.
   */
  function guardDom(): MutationObserver | null {
    if (!isDom() || typeof MutationObserver !== 'function') return null;
    const el = resolveTarget(target);
    const attributeFilter: string[] = Array.isArray(attribute) ? [...attribute] : [attribute];
    if (enableColorScheme) attributeFilter.push('style');
    let windowStart = 0;
    let restorations = 0;
    try {
      const mo = new MutationObserver(() => {
        if (owners.get(el) !== ownerToken) return;
        const applied = value?.[state.resolvedTheme] ?? state.resolvedTheme;
        const schemeDrift =
          enableColorScheme &&
          (state.resolvedTheme === 'light' || state.resolvedTheme === 'dark') &&
          el.style.colorScheme !== state.resolvedTheme;
        if (!schemeDrift && isAttributeAlreadyApplied(el, attribute, applied)) return;
        const now = Date.now();
        if (now - windowStart > GUARD_WINDOW_MS) {
          windowStart = now;
          restorations = 0;
        }
        if (++restorations > GUARD_BUDGET) {
          mo.disconnect();
          return;
        }
        apply(state, true);
      });
      mo.observe(el, { attributes: true, attributeFilter });
      return mo;
    } catch (_e) {
      return null;
    }
  }

  function unmount(): void {
    mounted = false;
    systemSubscribed = false;
    observer?.disconnect();
    observer = null;
    unsubSystem?.();
    unsubStorage?.();
    unsubPageShow?.();
    unsubSystem = null;
    unsubStorage = null;
    unsubPageShow = null;
  }

  function subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }

  function getState(): ThemeState {
    return state;
  }

  function getServerSnapshot(): ThemeState {
    return serverState;
  }

  function update(next: UpdatableStoreOptions): void {
    // `touched` means a DOM-affecting prop (value/themeColor mapping) actually
    // changed — NOT merely that the key was present. Providers pass every
    // updatable prop on every render, and consumers routinely pass inline
    // literals (`value={{…}}`, `themeColor={{…}}`, `onChange={() => …}`) whose
    // identity changes each render. Without a real-change check, `update()`
    // would re-apply to the DOM on every parent re-render. We compare by value
    // (structural) so a fresh-but-equal object is correctly treated as no-op.
    let touched = false;

    if ('value' in next) {
      const nextValue = next.value ?? null;
      if (!recordEqual(value, nextValue)) {
        value = nextValue;
        touched = true;
      }
    }
    if ('themeColor' in next) {
      const nextThemeColor = next.themeColor ?? null;
      if (!themeColorEqual(themeColor, nextThemeColor)) {
        themeColor = nextThemeColor;
        touched = true;
      }
    }
    if ('disableTransitionOnChange' in next && next.disableTransitionOnChange !== undefined) {
      disableTransitionOnChange = next.disableTransitionOnChange;
    }
    if ('respectReducedMotion' in next && next.respectReducedMotion !== undefined) {
      respectReducedMotion = next.respectReducedMotion;
    }
    if ('transition' in next) {
      transition = next.transition;
    }
    if ('onChange' in next) {
      onChange = next.onChange;
    }
    let needsResolve = false;
    if ('followSystem' in next && next.followSystem !== undefined) {
      if (followSystem !== next.followSystem) needsResolve = true;
      followSystem = next.followSystem;
    }

    // forcedTheme is the headline live-update use case. Re-resolve and apply
    // immediately so a route-group <ThemeProvider forcedTheme="dark"> snaps to
    // the forced value on entry and back to the user's choice on exit.
    if ('forcedTheme' in next) {
      const before = forcedTheme;
      forcedTheme = next.forcedTheme ?? null;
      if (before !== forcedTheme) needsResolve = true;
    }

    if (needsResolve) {
      const fresh = initial();
      // Always emit on transitions even if the resolved value happens to
      // match — `state.forcedTheme` is part of the contract.
      setState(fresh, true);
      return;
    }

    // For non-theme-affecting prop changes (themeColor, value remap), nudge
    // the DOM so the new mapping is applied without changing `state`.
    if (touched && mounted) apply(state, true);
  }

  return { getState, getServerSnapshot, subscribe, setTheme, mount, unmount, update };
}
