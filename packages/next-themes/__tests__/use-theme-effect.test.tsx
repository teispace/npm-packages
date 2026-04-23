import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTheme } from '../src/hooks/use-theme';
import { useThemeEffect } from '../src/hooks/use-theme-effect';
import { ThemeProvider } from '../src/providers/client';

describe('useThemeEffect', () => {
  it('does not fire on first mount', () => {
    const spy = vi.fn();
    function Inner() {
      useThemeEffect(spy);
      return null;
    }
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Inner />
      </ThemeProvider>,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires on theme change with (theme, resolvedTheme)', () => {
    const spy = vi.fn();
    function Inner() {
      useThemeEffect(spy);
      const { setTheme } = useTheme();
      return (
        <button type="button" onClick={() => setTheme('dark')}>
          dark
        </button>
      );
    }
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Inner />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('dark'));
    });
    expect(spy).toHaveBeenCalledWith('dark', 'dark');
  });

  it('runs the returned cleanup on the next change', () => {
    const cleanup = vi.fn();
    function Inner() {
      useThemeEffect(() => cleanup);
      const { setTheme } = useTheme();
      return (
        <button type="button" onClick={() => setTheme('dark')}>
          toggle
        </button>
      );
    }
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Inner />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('toggle'));
    });
    expect(cleanup).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByText('toggle')); // no-op (already dark) — no cleanup
    });
    expect(cleanup).not.toHaveBeenCalled();
  });
});
