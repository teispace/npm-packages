'use client';

import { useHydrated } from '../hooks/use-hydrated';
import type { ThemeProviderProps } from './props';
import { useThemeProvider } from './shared';

/**
 * Generic React ThemeProvider for non-Next.js apps (Vite, Remix, TanStack
 * Start, etc.). The inline blocking script is rendered via
 * `dangerouslySetInnerHTML` and only on the server render.
 *
 * For Next.js App Router, prefer the default `@teispace/next-themes` entry —
 * it uses `useServerInsertedHTML` and avoids the React 19 inline-script warning.
 */
export function ThemeProvider(props: ThemeProviderProps): React.JSX.Element {
  const { Context, store, renderScript } = useThemeProvider(props);

  // Only emit the blocking script during the server render (and the matching
  // hydration render). On the client it is dead weight — React never executes
  // inline scripts rendered on the client (it also warns in React 19), and the
  // theme is applied imperatively when the store mounts. Gating on hydration
  // keeps SSR/hydration markup identical, then drops the tag on the first
  // post-hydration commit with no mismatch.
  const hydrated = useHydrated();

  return (
    <Context.Provider value={store}>
      {hydrated ? null : renderScript()}
      {props.children}
    </Context.Provider>
  );
}
