import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemedIcon } from '../src/components/themed-icon';
import { ThemedImage } from '../src/components/themed-image';
import { ThemeProvider } from '../src/providers/client';

describe('ThemedImage', () => {
  it('renders the active-theme src after mount', async () => {
    const { container } = render(
      <ThemeProvider storage="local" defaultTheme="dark" enableSystem={false}>
        <ThemedImage sources={{ light: '/logo-light.png', dark: '/logo-dark.png' }} alt="logo" />
      </ThemeProvider>,
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('/logo-dark.png');
    });
  });

  it('uses fallbackSrc when no matching source is available', async () => {
    const { container } = render(
      <ThemeProvider storage="local" defaultTheme="sepia" themes={['sepia']} enableSystem={false}>
        <ThemedImage sources={{ dark: '/d.png' }} fallbackSrc="/fallback.png" alt="x" />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/fallback.png');
    });
  });

  it('returns null when no src can be resolved', () => {
    const { container } = render(
      <ThemeProvider storage="local" defaultTheme="sepia" themes={['sepia']} enableSystem={false}>
        <ThemedImage sources={{}} alt="x" />
      </ThemeProvider>,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('ThemedIcon', () => {
  it('renders the active-theme variant after mount', async () => {
    const { getByTestId } = render(
      <ThemeProvider storage="local" defaultTheme="dark" enableSystem={false}>
        <ThemedIcon
          variants={{
            light: <span data-testid="v">sun</span>,
            dark: <span data-testid="v">moon</span>,
          }}
        />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('v').textContent).toBe('moon');
    });
  });
});
