import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTheme } from '../src/hooks/use-theme';
import { ThemeProvider } from '../src/providers/client';

function Consumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
    </div>
  );
}

describe('ThemeProvider (client)', () => {
  it('provides theme state via useTheme', () => {
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });

  it('updates theme on setTheme', () => {
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Consumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('dark'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applies class attribute when requested', () => {
    render(
      <ThemeProvider storage="local" attribute="class" defaultTheme="light" enableSystem={false}>
        <Consumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('dark'));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('honors forcedTheme', () => {
    render(
      <ThemeProvider storage="local" forcedTheme="dark">
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    act(() => {
      fireEvent.click(screen.getByText('light'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('nested providers maintain independent state', () => {
    function Dual() {
      return (
        <ThemeProvider storage="none" defaultTheme="light" enableSystem={false}>
          <Consumer />
          <ThemeProvider storage="none" defaultTheme="dark" enableSystem={false} target="body">
            <Inner />
          </ThemeProvider>
        </ThemeProvider>
      );
    }
    function Inner() {
      const { theme } = useTheme();
      return <span data-testid="inner">{theme}</span>;
    }
    render(<Dual />);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('inner').textContent).toBe('dark');
  });

  it('renders the inline blocking script', () => {
    const { container } = render(
      <ThemeProvider storage="local">
        <Consumer />
      </ThemeProvider>,
    );
    const scripts = container.querySelectorAll('script');
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts[0].innerHTML).toContain('!function');
  });
});
