import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { localAdapter } from '../src/adapters/local';
import { useHydrated } from '../src/hooks/use-hydrated';
import { useTheme } from '../src/hooks/use-theme';
import { ThemeProvider } from '../src/providers/client';

/**
 * Replace `globalThis.localStorage` wholesale with a stub whose `setItem`
 * throws.
 *
 * Assigning to `localStorage.setItem` is NOT portable here. Depending on the
 * Node version, `globalThis.localStorage` is either jsdom's real `Storage`
 * (where `setItem` lives on `Storage.prototype`, so an instance assignment does
 * not shadow it) or the plain-object polyfill this suite's setup installs when
 * the inherited implementation is unusable (see `__tests__/setup.ts`). The
 * instance-assignment version of this test passed locally on Node 26 and failed
 * on CI's Node 24 for exactly that reason.
 *
 * Swapping the whole binding via `defineProperty` works against both shapes.
 * `getItem` is kept functional because `hasLocalStorage()` probes for both
 * methods before the adapter will attempt a write at all.
 */
function breakLocalStorageWrites(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stub: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('QuotaExceededError');
    },
    removeItem: () => {},
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: stub });
  return () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  };
}

describe('onStorageError', () => {
  it('reports a failing localStorage write from the adapter', () => {
    const restore = breakLocalStorageWrites();
    try {
      const onStorageError = vi.fn();
      const adapter = localAdapter({ key: 'theme', cookie: { name: 'theme' }, onStorageError });
      adapter.set('dark');

      expect(onStorageError).toHaveBeenCalledTimes(1);
      const [error, ctx] = onStorageError.mock.calls[0];
      expect(error).toBeInstanceOf(DOMException);
      expect(ctx).toEqual({ operation: 'set', key: 'theme' });
    } finally {
      restore();
    }
  });

  it('surfaces the failure through the provider prop', () => {
    const restore = breakLocalStorageWrites();
    try {
      const onStorageError = vi.fn();
      let setTheme: ((t: string) => void) | undefined;
      function Consumer() {
        setTheme = useTheme().setTheme as (t: string) => void;
        return null;
      }
      render(
        <ThemeProvider
          storage="local"
          themes={['light', 'dark']}
          enableSystem={false}
          onStorageError={onStorageError}
        >
          <Consumer />
        </ThemeProvider>,
      );
      setTheme?.('dark');
      expect(onStorageError).toHaveBeenCalled();
      expect(onStorageError.mock.calls[0][1]).toMatchObject({ operation: 'set' });
    } finally {
      restore();
    }
  });

  it('a storage failure never breaks theming', () => {
    const restore = breakLocalStorageWrites();
    try {
      let setTheme: ((t: string) => void) | undefined;
      function Consumer() {
        setTheme = useTheme().setTheme as (t: string) => void;
        return <span data-testid="ok">rendered</span>;
      }
      render(
        <ThemeProvider storage="local" themes={['light', 'dark']} enableSystem={false}>
          <Consumer />
        </ThemeProvider>,
      );
      // No onStorageError handler and a throwing store: must still not throw.
      expect(() => setTheme?.('dark')).not.toThrow();
      expect(screen.getByTestId('ok')).toBeTruthy();
      // The DOM still got the new theme even though persistence failed.
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      restore();
    }
  });
});

describe('useHydrated', () => {
  it('is true once rendered on the client', () => {
    function Probe() {
      return <span data-testid="h">{String(useHydrated())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('h').textContent).toBe('true');
  });
});
