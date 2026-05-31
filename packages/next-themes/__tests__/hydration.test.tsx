import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemedImage } from '../src/components/themed-image';
import { useTheme } from '../src/hooks/use-theme';
import { ThemeProvider } from '../src/providers/client';

/**
 * These tests exercise the real SSR → hydration → post-hydration sequence
 * (not pure server or pure client render), which is where the inline-script
 * gating (`useIsServerRender`) and the seeded `getServerSnapshot` can break.
 *
 * React logs hydration mismatches via console.error, so we spy on it and
 * assert presence/absence of hydration errors.
 */

function Probe() {
  const { resolvedTheme } = useTheme();
  return <span data-testid="resolved">{resolvedTheme || 'none'}</span>;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
});

function hydrationErrors(): string[] {
  return errorSpy.mock.calls
    .map((c) => String(c[0]))
    .filter((m) => /hydrat|did not match|server.*client|mismatch/i.test(m));
}

describe('SSR → hydration: inline script gating (risk A)', () => {
  it('emits the script on the server, matches on hydration, then drops it with no mismatch', async () => {
    const tree = (
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <Probe />
      </ThemeProvider>
    );

    // 1. Server render includes the blocking script.
    const html = renderToString(tree);
    expect(html).toContain('<script');

    // 2. Put the server HTML into a container and hydrate. The hydration render
    //    must MATCH (script present), so there must be no hydration error.
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('script')).not.toBeNull();

    await act(async () => {
      hydrateRoot(container, tree);
    });

    // 3. No hydration mismatch was logged.
    expect(hydrationErrors()).toEqual([]);

    // 4. After hydration the inline script is dropped from the tree (it already
    //    executed during SSR; React removes the now-unrendered node).
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('SSR → hydration: seeded getServerSnapshot (risk B)', () => {
  it('SSR-renders the seeded theme and hydrates ThemedImage with no mismatch when initialTheme matches the client', async () => {
    // Seed both the server (initialTheme) and the client (localStorage) to the
    // SAME concrete theme — the recommended flash-free pattern.
    window.localStorage.setItem('theme', 'dark');

    const tree = (
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false} initialTheme="dark">
        <ThemedImage
          sources={{ light: '/light.png', dark: '/dark.png' }}
          alt="logo"
          data-testid="img"
        />
      </ThemeProvider>
    );

    // Server render picks the seeded 'dark' src (not the fallback/first).
    const html = renderToString(tree);
    expect(html).toContain('/dark.png');
    expect(html).not.toContain('/light.png');

    const container = document.createElement('div');
    container.innerHTML = html;

    await act(async () => {
      hydrateRoot(container, tree);
    });

    // Seeded server snapshot === client snapshot → no hydration mismatch.
    expect(hydrationErrors()).toEqual([]);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/dark.png');
  });

  it('uses the seeded resolvedTheme on the server render for useTheme consumers', () => {
    const html = renderToString(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false} initialTheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    // Previously this was empty ('none'); the seeded server snapshot now
    // resolves it to 'dark'.
    expect(html).toContain('dark');
    expect(html).not.toContain('>none<');
  });
});
