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

const DISABLE_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;transition:none!important;-moz-transition:none!important;-o-transition:none!important;}';

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

  function initial(): ThemeState {
    const systemTheme = getSystemTheme();
    let rawTheme: string;
    if (forcedTheme) {
      rawTheme = forcedTheme;
    } else if (followSystem && enableSystem) {
      rawTheme = 'system';
    } else {
      rawTheme = readStored() ?? initialTheme ?? defaultTheme;
    }
    const theme = normalizeSelection(rawTheme, themes, defaultTheme, enableSystem);
    const resolved = theme === 'system' ? systemTheme : theme;
    return {
      theme,
      resolvedTheme: resolved,
      systemTheme: enableSystem ? systemTheme : null,
      forcedTheme: forcedTheme ?? null,
      themes: allThemes,
    };
  }

  let state: ThemeState = initial();
  // Frozen snapshot of the seeded state for `useSyncExternalStore`'s
  // server-snapshot slot. Must be referentially stable across calls (React
  // calls it repeatedly during render), so it is computed once here. On the
  // server `setState` never runs, so this equals the live state; on the client
  // it is only ever read during the hydration render. When the provider is
  // seeded (initialTheme / forcedTheme from the server cookie) this lets SSR
  // render the correct resolved theme instead of an empty placeholder, so
  // theme-dependent components (ThemedImage/ThemedIcon) avoid a post-hydration
  // swap.
  const serverState: ThemeState = state;
  let previousApplied: string | null = null;
  const listeners = new Set<Listener>();
  let mounted = false;
  let unsubSystem: (() => void) | null = null;
  let unsubStorage: (() => void) | null = null;
  let unsubPageShow: (() => void) | null = null;

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
      restore = disableTransition(
        typeof disableTransitionOnChange === 'string' ? disableTransitionOnChange : DISABLE_CSS,
        respectReducedMotion,
      );
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
      const systemTheme = getSystemTheme();
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
    const resolvedVt = resolveTransition(effective, respectReducedMotion);
    if (resolvedVt) {
      startViewTransition(() => doApply(true), resolvedVt);
    } else {
      doApply(false);
    }
  }

  function onSystemChange(systemTheme: 'light' | 'dark'): void {
    // An OS light/dark flip only repaints when the *selected* theme is
    // `system`. setState() applies to the DOM only when resolvedTheme
    // changes, so for a concrete 'light'/'dark' selection this updates the
    // user-visible systemTheme (one emit) without rewriting the DOM.
    setState({
      ...state,
      systemTheme,
      resolvedTheme: state.theme === 'system' ? systemTheme : state.resolvedTheme,
    });
  }

  function onStorageChange(raw: string | null): void {
    if (forcedTheme) return;
    const nextTheme = normalizeSelection(raw, themes, defaultTheme, enableSystem);
    const systemTheme = getSystemTheme();
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
    }
    if (storage.subscribe) {
      unsubStorage = storage.subscribe(onStorageChange);
    }
    // bfcache: when the page is restored from back/forward cache, storage
    // may have changed in another tab. Re-read and reconcile.
    if (hasWindowEvents()) {
      const onPageShow = (e: PageTransitionEvent): void => {
        if (!e.persisted) return;
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

  function unmount(): void {
    mounted = false;
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
