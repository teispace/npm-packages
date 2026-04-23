import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useThemeValue } from '../src/hooks/use-theme-value';
import { ThemeProvider } from '../src/providers/client';

function Consumer({ map }: { map: Parameters<typeof useThemeValue>[0] }) {
  const value = useThemeValue(map);
  return <span data-testid="v">{String(value)}</span>;
}

describe('useThemeValue', () => {
  it('returns the value for the active resolved theme', () => {
    render(
      <ThemeProvider storage="local" defaultTheme="dark" enableSystem={false}>
        <Consumer map={{ light: '#fff', dark: '#000' }} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('#000');
  });

  it('falls back to default when no theme key matches', () => {
    render(
      <ThemeProvider
        storage="local"
        defaultTheme="sepia"
        themes={['sepia', 'dark']}
        enableSystem={false}
      >
        <Consumer map={{ dark: '#000', default: '#999' }} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('#999');
  });

  it('returns undefined when no key matches and no default', () => {
    render(
      <ThemeProvider
        storage="local"
        defaultTheme="sepia"
        themes={['sepia', 'dark']}
        enableSystem={false}
      >
        <Consumer map={{ dark: '#000' }} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('undefined');
  });

  it('supports the system key', () => {
    render(
      <ThemeProvider storage="local" defaultTheme="system">
        <Consumer map={{ light: '#fff', dark: '#000', system: 'auto' }} />
      </ThemeProvider>,
    );
    // resolvedTheme is light (happy-dom default); the resolved key wins over system
    expect(['#fff', '#000']).toContain(screen.getByTestId('v').textContent);
  });
});
