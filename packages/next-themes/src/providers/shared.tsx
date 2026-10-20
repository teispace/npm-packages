'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { resolveAdapter } from '../adapters/index';
import { DefaultThemeContext, type ThemeContext } from '../core/context';
import { ensureCursorTracker } from '../core/cursor-tracker';
import { isDom } from '../core/env';
import { getScriptConfig, THEME_SCRIPT, THEME_SCRIPT_ATTRIBUTE } from '../core/script';
import { createStore, type ThemeStore } from '../core/store';
import { resolveStorageConfig, type ThemeProviderProps } from './props';

/**
 * Mount in a layout effect in the browser so a client-rendered app (no SSR, so
 * no inline script) applies the theme before the first paint rather than one
 * frame after it. On a server there is nothing to mount, and React 18 warns
 * about layout effects there, so fall back to `useEffect`.
 */
const useMountEffect = isDom() ? useLayoutEffect : useEffect;

export interface ThemeProviderState {
  Context: ThemeContext;
  store: ThemeStore;
  /** The anti-FOUC `<script>`, or `null` when `noScript` is set. */
  renderScript: () => React.JSX.Element | null;
}

/**
 * Everything the Next.js and the generic provider share: building the store
 * once, mounting it, syncing the props that may change at runtime, and
 * rendering the inline script. The two providers differ only in *where* they
 * put the script.
 */
export function useThemeProvider(props: ThemeProviderProps): ThemeProviderState {
  const {
    themes = ['light', 'dark'],
    defaultTheme = 'system',
    forcedTheme,
    enableSystem = true,
    followSystem = false,
    attribute = 'data-theme',
    value,
    target = 'html',
    storage,
    storageKey,
    cookieOptions,
    disableTransitionOnChange = false,
    respectReducedMotion = true,
    enableColorScheme = true,
    themeColor,
    initialTheme,
    nonce,
    noScript = false,
    scriptProps,
    transition,
    onChange,
    onStorageError,
    themeContext,
  } = props;

  const {
    mode: storageMode,
    key: resolvedStorageKey,
    cookieOptions: resolvedCookieOptions,
  } = resolveStorageConfig(storage, storageKey, cookieOptions);

  const storeRef = useRef<ThemeStore | null>(null);
  // NOTE: `storeRef.current === null` — NOT `!storeRef.current`.
  // React Compiler's ValidateNoRefAccessInRender treats a `!ref.current` unary
  // read during render as an error ("Cannot access refs during render") and
  // bails on the whole component, but explicitly allows the lazy-init guard
  // written as a comparison against null. Same behaviour, compiler-clean.
  if (storeRef.current === null) {
    storeRef.current = createStore({
      themes,
      defaultTheme,
      enableSystem,
      forcedTheme: forcedTheme ?? null,
      initialTheme: initialTheme ?? null,
      followSystem,
      attribute,
      value: value ?? null,
      enableColorScheme,
      themeColor: themeColor ?? null,
      disableTransitionOnChange,
      respectReducedMotion,
      target,
      storage: resolveAdapter({
        mode: storageMode,
        key: resolvedStorageKey,
        cookieOptions: resolvedCookieOptions,
        onStorageError,
      }),
      transition,
      onChange,
      nonce,
    });
  }
  const store = storeRef.current;

  useMountEffect(() => {
    store.mount();
    ensureCursorTracker();
    return () => store.unmount();
  }, [store]);

  // Sync runtime-mutable props into the store. The store is built once
  // (storeRef) so without this, changes to forcedTheme/value/themeColor/etc.
  // never propagate. Limited to props that don't invalidate the inline script.
  useEffect(() => {
    store.update({
      forcedTheme: forcedTheme ?? null,
      followSystem,
      value: value ?? null,
      themeColor: themeColor ?? null,
      disableTransitionOnChange,
      respectReducedMotion,
      transition,
      onChange,
    });
  }, [
    store,
    forcedTheme,
    followSystem,
    value,
    themeColor,
    disableTransitionOnChange,
    respectReducedMotion,
    transition,
    onChange,
  ]);

  const renderScript = (): React.JSX.Element | null => {
    if (noScript) return null;
    const config = getScriptConfig({
      storageMode,
      storageKey: resolvedStorageKey,
      cookieName: resolvedCookieOptions?.name ?? resolvedStorageKey,
      attribute,
      themes,
      defaultTheme,
      enableSystem,
      followSystem,
      forcedTheme: forcedTheme ?? null,
      initialTheme: initialTheme ?? null,
      value: value ?? null,
      enableColorScheme,
      themeColor: themeColor ?? null,
      disableTransitionOnChange,
      respectReducedMotion,
      target,
    });
    return (
      <script
        // Cloudflare Rocket Loader defers every script it does not see this
        // on, which turns the blocking anti-FOUC script into a flash.
        data-cfasync="false"
        // Browsers hide the nonce attribute after load, so the hydrated
        // attribute legitimately differs from the server HTML.
        suppressHydrationWarning
        {...scriptProps}
        {...{ [THEME_SCRIPT_ATTRIBUTE]: config }}
        nonce={nonce}
        // The text is constant; the configuration travels in the attribute
        // above. That is what lets one published hash allow it under a
        // hash-based CSP.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: anti-FOUC inline script
        dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
      />
    );
  };

  return { Context: themeContext ?? DefaultThemeContext, store, renderScript };
}
