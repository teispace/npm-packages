import { useServerInsertedHTML } from 'next/navigation';
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
 * Next.js App Router ThemeProvider. The inline anti-FOUC script is injected
 * via `useServerInsertedHTML`, placing it in the server-rendered HTML head —
 * it blocks before hydration, and React 19 does not emit a client-script
 * warning since the script is not part of the React tree.
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

  const insertedRef = useRef(false);
  useServerInsertedHTML(() => {
    if (insertedRef.current) return null;
    insertedRef.current = true;
    const script = buildScript({
      storageMode: storage,
      storageKey,
      cookieName: cookieOptions?.name ?? storageKey,
      attribute,
      themes,
      defaultTheme,
      enableSystem,
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
      <script
        nonce={nonce}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: anti-FOUC inline script
        dangerouslySetInnerHTML={{ __html: script }}
      />
    );
  });

  return (
    <ThemeStoreContext.Provider value={storeRef.current}>{children}</ThemeStoreContext.Provider>
  );
}
