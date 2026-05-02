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
import type { Attribute, Listener, SetThemeOptions, ThemeState, TransitionConfig } from './types';
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

export interface ThemeStore {
  getState: () => ThemeState;
  subscribe: (l: Listener) => () => void;
  setTheme: (theme: string, options?: SetThemeOptions) => void;
  /** Start side-effect subscriptions (system/storage). Idempotent. */
  mount: () => void;
  /** Tear down subscriptions. */
  unmount: () => void;
}

const DISABLE_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;transition:none!important;-moz-transition:none!important;-o-transition:none!important;}';

export function createStore(opts: StoreOptions): ThemeStore {
  const {
    themes,
    defaultTheme,
    enableSystem,
    forcedTheme,
    initialTheme,
    followSystem,
    attribute,
    value,
    enableColorScheme,
    themeColor,
    disableTransitionOnChange,
    respectReducedMotion,
    target,
    storage,
    transition,
    onChange,
  } = opts;

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
    const same =
      state.theme === next.theme &&
      state.resolvedTheme === next.resolvedTheme &&
      state.systemTheme === next.systemTheme;
    state = next;
    if (same) return;
    apply(next, skipTransitionDisable);
    emit();
    onChange?.(next.theme, next.resolvedTheme);
  }

  function setTheme(raw: string, options?: SetThemeOptions): void {
    if (forcedTheme) return;
    const isSys = raw === 'system' && enableSystem;
    // Reject unknown values — `'system'` is only valid when `enableSystem`.
    if (!isSys && !themes.includes(raw)) return;
    const theme = normalizeSelection(raw, themes, defaultTheme, enableSystem);

    const doApply = (): void => {
      storage.set(theme);
      const systemTheme = getSystemTheme();
      const resolved = theme === 'system' ? systemTheme : theme;
      setState({
        ...state,
        theme,
        resolvedTheme: resolved,
        systemTheme: enableSystem ? systemTheme : null,
      });
    };

    const effective = options?.transition !== undefined ? options.transition : transition;
    const resolvedVt = resolveTransition(effective, respectReducedMotion);
    if (resolvedVt) {
      startViewTransition(doApply, resolvedVt);
    } else {
      doApply();
    }
  }

  function onSystemChange(systemTheme: 'light' | 'dark'): void {
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

  return { getState, subscribe, setTheme, mount, unmount };
}
