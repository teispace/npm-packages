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

// ===========================================================================
// Regression: two createThemes() APIs must not share a context.
//
// Every hook and component used to read one module-level context singleton, so
// two independently-created typed APIs collided: whichever provider sat nearest
// in the tree served BOTH hook sets. An embedded widget's useTheme() could
// therefore report the app shell's themes. Each factory call now mints its own
// context.
// ===========================================================================

describe('createThemes: context isolation', () => {
  const Shell = createThemes({
    themes: ['light', 'dark'] as const,
    defaultTheme: 'dark',
    enableSystem: false,
    storage: 'none',
  });

  const Widget = createThemes({
    themes: ['alpha', 'beta'] as const,
    defaultTheme: 'beta',
    enableSystem: false,
    storage: 'none',
    // A distinct attribute so the two providers cannot fight over the DOM.
    attribute: 'data-widget-theme',
  });

  function ShellConsumer() {
    const { theme, themes } = Shell.useTheme();
    return (
      <>
        <span data-testid="shell-theme">{theme}</span>
        <span data-testid="shell-themes">{themes.join(',')}</span>
      </>
    );
  }

  function WidgetConsumer() {
    const { theme, themes } = Widget.useTheme();
    return (
      <>
        <span data-testid="widget-theme">{theme}</span>
        <span data-testid="widget-themes">{themes.join(',')}</span>
      </>
    );
  }

  it('keeps each API bound to its own provider when nested', () => {
    render(
      <Shell.ThemeProvider>
        <ShellConsumer />
        <Widget.ThemeProvider>
          {/* Both consumers sit under the widget provider in the tree. Before
              the fix, the nearest provider won for both and shell-theme would
              read the widget's value. */}
          <ShellConsumer />
          <WidgetConsumer />
        </Widget.ThemeProvider>
      </Shell.ThemeProvider>,
    );

    const shellThemes = screen.getAllByTestId('shell-themes');
    for (const node of shellThemes) {
      expect(node.textContent).toBe('light,dark');
    }
    for (const node of screen.getAllByTestId('shell-theme')) {
      expect(node.textContent).toBe('dark');
    }

    expect(screen.getByTestId('widget-themes').textContent).toBe('alpha,beta');
    expect(screen.getByTestId('widget-theme').textContent).toBe('beta');
  });

  it("a factory hook outside its own provider stays inert rather than reading another API's store", () => {
    render(
      <Shell.ThemeProvider>
        <WidgetConsumer />
      </Shell.ThemeProvider>,
    );
    // No widget provider above it -> inert, NOT the shell's state.
    expect(screen.getByTestId('widget-themes').textContent).toBe('');
    expect(screen.getByTestId('widget-theme').textContent).toBe('');
  });
});
