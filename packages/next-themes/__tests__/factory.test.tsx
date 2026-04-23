import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createThemes } from '../src/client';

describe('createThemes', () => {
  const { ThemeProvider, useTheme, useThemeValue, ScopedTheme } = createThemes({
    themes: ['light', 'dark', 'sepia'] as const,
    defaultTheme: 'light',
    enableSystem: false,
    storage: 'local',
  });

  function Consumer() {
    const { theme, setTheme } = useTheme();
    const color = useThemeValue({ light: '#fff', dark: '#000', sepia: '#f3e9d2' });
    return (
      <div>
        <span data-testid="theme">{theme}</span>
        <span data-testid="color">{color}</span>
        <button type="button" onClick={() => setTheme('sepia')}>
          sepia
        </button>
      </div>
    );
  }

  it('provides baked-in defaults', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('color').textContent).toBe('#fff');
  });

  it('setTheme accepts the typed theme union', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('sepia'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('sepia');
    expect(screen.getByTestId('color').textContent).toBe('#f3e9d2');
  });

  it('per-use props override factory defaults', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('ScopedTheme is typed to the theme union', () => {
    render(
      <ThemeProvider>
        <ScopedTheme theme="sepia">
          <Consumer />
        </ScopedTheme>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('sepia');
  });
});
