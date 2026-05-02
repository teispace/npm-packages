'use client';

import { useEffect, useRef } from 'react';
import { resolveAdapter } from '../adapters/index';
import { ensureCursorTracker } from '../core/cursor-tracker';
import { buildScript } from '../core/script';
import { createStore, type ThemeStore } from '../core/store';
import { ThemeStoreContext } from '../hooks/use-theme';
import type { ThemeProviderProps } from './props';

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
    storage = 'hybrid',
    storageKey = 'theme',
    cookieOptions,
    disableTransitionOnChange = false,
    respectReducedMotion = true,
    enableColorScheme = true,
    themeColor,
    initialTheme,
    nonce,
    noScript = false,
    transition,
    onChange,
  } = props;

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
      storage: resolveAdapter({ mode: storage, key: storageKey, cookieOptions }),
      transition,
      onChange,
    });
  }

  useEffect(() => {
    const s = storeRef.current;
    s?.mount();
    ensureCursorTracker();
    return () => {
      s?.unmount();
    };
  }, []);

  const script = noScript
    ? null
    : buildScript({
        storageMode: storage,
        storageKey,
        cookieName: cookieOptions?.name ?? storageKey,
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
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: anti-FOUC inline script
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ) : null}
      {children}
    </ThemeStoreContext.Provider>
  );
}
