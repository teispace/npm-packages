import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { localAdapter } from '../src/adapters/local';
import { useHydrated } from '../src/hooks/use-hydrated';
import { useTheme } from '../src/hooks/use-theme';
import { ThemeProvider } from '../src/providers/client';

/**
 * The suite's setup installs a plain-object localStorage polyfill (see
 * `__tests__/setup.ts`), so it does NOT inherit from `Storage.prototype` —
 * spy on the instance method directly.
 */
function breakLocalStorageWrites(): () => void {
  const ls = globalThis.localStorage;
  const original = ls.setItem;
  ls.setItem = () => {
    throw new DOMException('QuotaExceededError');
  };
  return () => {
    ls.setItem = original;
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
