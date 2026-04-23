import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScopedTheme } from '../src/components/scoped-theme';
import { useTheme } from '../src/hooks/use-theme';
import { ThemeProvider } from '../src/providers/client';

function Report({ id }: { id: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid={`t-${id}`}>{theme}</span>
      <button data-testid={`b-${id}`} type="button" onClick={() => setTheme('light')}>
        set-light
      </button>
    </div>
  );
}

describe('ScopedTheme', () => {
  it('overrides theme for the sub-tree only', () => {
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Report id="outer" />
        <ScopedTheme theme="dark">
          <Report id="inner" />
        </ScopedTheme>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('t-outer').textContent).toBe('light');
    expect(screen.getByTestId('t-inner').textContent).toBe('dark');
  });

  it('setTheme inside scope is a no-op', () => {
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <ScopedTheme theme="dark">
          <Report id="inner" />
        </ScopedTheme>
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('b-inner'));
    });
    expect(screen.getByTestId('t-inner').textContent).toBe('dark');
  });

  it('applies the theme class to the wrapper element', () => {
    const { container } = render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <ScopedTheme theme="dark" attribute="class">
          <span>x</span>
        </ScopedTheme>
      </ThemeProvider>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.classList.contains('dark')).toBe(true);
  });

  it('supports data-attribute output', () => {
    const { container } = render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <ScopedTheme theme="dark" attribute="data-theme">
          <span>x</span>
        </ScopedTheme>
      </ThemeProvider>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.getAttribute('data-theme')).toBe('dark');
  });

  it('maps theme via value prop', () => {
    const { container } = render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <ScopedTheme theme="dark" attribute="class" value={{ dark: 'theme-dark' }}>
          <span>x</span>
        </ScopedTheme>
      </ThemeProvider>,
    );
    expect(container.querySelector('div')?.classList.contains('theme-dark')).toBe(true);
  });
});
