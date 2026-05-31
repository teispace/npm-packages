'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { resolveAdapter } from '../adapters/index';
import { ensureCursorTracker } from '../core/cursor-tracker';
import { buildScript } from '../core/script';
import { createStore, type ThemeStore } from '../core/store';
import { ThemeStoreContext } from '../hooks/use-theme';
import { resolveStorageConfig, type ThemeProviderProps } from './props';

const noopSubscribe = (): (() => void) => () => {};
/**
 * `true` during the server render, `false` once on the client. Implemented via
 * `useSyncExternalStore` so the value is stable across the hydration boundary
 * (server snapshot `true`, client snapshot `false`) without triggering a
 * hydration mismatch.
 */
function useIsServerRender(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );
}

const DISABLE_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;transition:none!important;-moz-transition:none!important;-o-transition:none!important;}';

/**
 * Generic React ThemeProvider for non-Next.js apps (Vite, Remix, CRA, etc.).
 * The inline blocking script is rendered via `dangerouslySetInnerHTML` and
 * only on the server render — `suppressHydrationWarning` prevents a mismatch.
 *
 * For Next.js App Router, prefer the default `@teispace/next-themes` entry —
 * it uses `useServerInsertedHTML` and avoids the React 19 inline-script warning.
 */
export function ThemeProvider(props: ThemeProviderProps): React.JSX.Element {
  const {
    children,
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
  } = props;

  const {
    mode: storageMode,
    key: resolvedStorageKey,
    cookieOptions: resolvedCookieOptions,
  } = resolveStorageConfig(storage, storageKey, cookieOptions);

  const storeRef = useRef<ThemeStore | null>(null);
  if (!storeRef.current) {
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
      }),
      transition,
      onChange,
    });
  }

  // True only during SSR + the hydration render; flips to false immediately
  // after on the client. Drives whether we emit the inline <script> (see below).
  const isServerRender = useIsServerRender();

  useEffect(() => {
    const s = storeRef.current;
    s?.mount();
    ensureCursorTracker();
    return () => {
      s?.unmount();
    };
  }, []);

  // See the matching effect in providers/next.tsx for the why.
  useEffect(() => {
    storeRef.current?.update({
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
    forcedTheme,
    followSystem,
    value,
    themeColor,
    disableTransitionOnChange,
    respectReducedMotion,
    transition,
    onChange,
  ]);

  // Only emit the blocking script during the server render (and the matching
  // hydration render). On the client it is dead weight — React never executes
  // inline scripts rendered on the client (it also warns in React 19), and the
  // theme is applied imperatively by store.mount() in the effect above. Gating
  // on `isServerRender` keeps SSR/hydration markup identical, then drops the
  // tag on the first post-hydration commit with no mismatch.
  const script =
    !isServerRender || noScript
      ? null
      : buildScript({
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
          disableTransitionOnChange:
            disableTransitionOnChange === true
              ? DISABLE_CSS
              : typeof disableTransitionOnChange === 'string'
                ? disableTransitionOnChange
                : null,
          respectReducedMotion,
          target,
        });

  return (
    <ThemeStoreContext.Provider value={storeRef.current}>
      {script ? (
        <script
          suppressHydrationWarning
          {...scriptProps}
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: anti-FOUC inline script
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ) : null}
      {children}
    </ThemeStoreContext.Provider>
  );
}
