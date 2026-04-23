import type { StorageAdapter } from '../adapters/types';
import {
  applyAttribute,
  applyColorScheme,
  applyThemeColor,
  disableTransition,
  getSystemTheme,
  resolveTarget,
  subscribeSystem,
} from './dom';
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

  function emit(): void {
    for (const l of listeners) l(state);
  }

  function apply(next: ThemeState, skipTransitionDisable = false): void {
    if (typeof document === 'undefined') return;
    const el = resolveTarget(target);
    const applied =
      value && value[next.resolvedTheme] != null ? value[next.resolvedTheme] : next.resolvedTheme;

    let restore: (() => void) | null = null;
    if (!skipTransitionDisable && disableTransitionOnChange) {
      restore = disableTransition(
        typeof disableTransitionOnChange === 'string' ? disableTransitionOnChange : DISABLE_CSS,
        respectReducedMotion,
      );
    }

    applyAttribute(
      el,
      attribute,
      next.resolvedTheme,
      previousApplied,
      value ?? undefined,
      allThemes,
    );
    if (enableColorScheme) applyColorScheme(el, next.resolvedTheme);
    applyThemeColor(next.theme, next.resolvedTheme, themeColor ?? undefined);

    previousApplied = applied;
    restore?.();
  }

  function setState(next: ThemeState): void {
    const same =
      state.theme === next.theme &&
      state.resolvedTheme === next.resolvedTheme &&
      state.systemTheme === next.systemTheme;
    state = next;
    if (same) return;
    apply(next);
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
    // Re-read in case storage changed between SSR and hydration (hybrid case).
    const fresh = initial();
    if (fresh.theme !== state.theme || fresh.resolvedTheme !== state.resolvedTheme) {
      setState(fresh);
    } else {
      // Ensure DOM matches store (idempotent; also catches cases where the
      // script didn't run, e.g. CSR-only env).
      apply(state, true);
    }
    if (enableSystem) {
      unsubSystem = subscribeSystem(onSystemChange);
    }
    if (storage.subscribe) {
      unsubStorage = storage.subscribe(onStorageChange);
    }
  }

  function unmount(): void {
    mounted = false;
    unsubSystem?.();
    unsubStorage?.();
    unsubSystem = null;
    unsubStorage = null;
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
