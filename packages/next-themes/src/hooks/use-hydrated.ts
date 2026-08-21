'use client';

import { useSyncExternalStore } from 'react';

/** A store that never changes — we only care about the server/client snapshot split. */
const noopSubscribe = (): (() => void) => () => {};
const getSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * `false` during the server render and the hydration render, `true` on every
 * commit after hydration.
 *
 * Use it to gate anything that must not differ between the server HTML and the
 * first client render — the classic case being UI that depends on a value only
 * the browser knows:
 *
 * ```tsx
 * const hydrated = useHydrated();
 * const { resolvedTheme } = useTheme();
 * // Render a stable placeholder until hydration completes.
 * return <span>{hydrated ? resolvedTheme : null}</span>;
 * ```
 *
 * ### Why `useSyncExternalStore` and not `useState` + `useEffect`
 * The `useState(false)` + `useEffect(() => setState(true))` idiom re-renders
 * every consumer one extra time after mount and, more importantly, is not
 * hydration-safe under concurrent rendering: React may replay the render.
 * `useSyncExternalStore` has a dedicated server-snapshot slot, so React itself
 * guarantees `false` on the server and during hydration, then `true` — with no
 * mismatch warning and no extra state.
 *
 * Note you usually do NOT need this for theming itself: `<ThemedImage>`,
 * `<ThemedIcon>` and `useTheme()` already read the store's seeded server
 * snapshot, so with `initialTheme` from the server cookie they render the
 * correct value in the very first pass. Reach for `useHydrated` for your own
 * browser-only UI.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, getSnapshot, getServerSnapshot);
}
