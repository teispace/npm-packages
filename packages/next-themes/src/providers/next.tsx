'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { useRef } from 'react';
import type { ThemeProviderProps } from './props';
import { useThemeProvider } from './shared';

/**
 * Next.js App Router ThemeProvider. The inline anti-FOUC script is injected
 * via `useServerInsertedHTML`, placing it in the server-rendered HTML head —
 * it blocks before hydration, and React 19 does not emit a client-script
 * warning since the script is not part of the React tree. A remount on the
 * client (say a root `[lang]` segment changing) renders no script at all,
 * which is what keeps upstream next-themes #397 away.
 */
export function ThemeProvider(props: ThemeProviderProps): React.JSX.Element {
  const { Context, store, renderScript } = useThemeProvider(props);

  const insertedRef = useRef(false);
  useServerInsertedHTML(() => {
    if (insertedRef.current) return null;
    insertedRef.current = true;
    return renderScript();
  });

  return <Context.Provider value={store}>{props.children}</Context.Provider>;
}
