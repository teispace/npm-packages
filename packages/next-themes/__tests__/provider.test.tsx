import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
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

describe('useTheme outside a provider', () => {
  it('returns inert empty values (does not lie about the active theme)', () => {
    function NoProvider() {
      const { theme, resolvedTheme, themes } = useTheme();
      return (
        <div>
          <span data-testid="theme">{`[${theme}]`}</span>
          <span data-testid="resolved">{`[${resolvedTheme}]`}</span>
          <span data-testid="themes">{themes.length}</span>
        </div>
      );
    }
    // Suppress the dev-only warn.
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      render(<NoProvider />);
      // Empty strings, not the previous `'system'` / `'light'` placeholders —
      // a consumer doing `theme === 'dark'` must not accidentally match.
      expect(screen.getByTestId('theme').textContent).toBe('[]');
      expect(screen.getByTestId('resolved').textContent).toBe('[]');
      expect(screen.getByTestId('themes').textContent).toBe('0');
    } finally {
      console.warn = origWarn;
    }
  });
});

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

  it('renders the inline blocking script in the server-rendered HTML', () => {
    // The blocking script must be present in the SSR output (that's the whole
    // point — it runs before paint to suppress FOUC).
    const html = renderToStaticMarkup(
      <ThemeProvider storage="local">
        <Consumer />
      </ThemeProvider>,
    );
    expect(html).toContain('<script');
    expect(html).toContain('!function');
  });

  it('does NOT render the inline script on a client-only mount', () => {
    // On the client there is no pre-paint window to protect, store.mount()
    // applies the theme imperatively, and React never executes an inline
    // <script> rendered on the client (and warns in React 19). So the tag must
    // be absent on a pure client render — this is the fix for that warning and
    // the dead, never-executing tag in SPA (Vite/CRA) mounts.
    const { container } = render(
      <ThemeProvider storage="local">
        <Consumer />
      </ThemeProvider>,
    );
    expect(container.querySelectorAll('script').length).toBe(0);
  });

  it('omits the inline script when noScript is set (server render)', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider storage="local" noScript>
        <Consumer />
      </ThemeProvider>,
    );
    expect(html).not.toContain('<script');
  });

  it('forwards scriptProps + nonce onto the inline <script> (upstream parity)', () => {
    // Upstream `next-themes` exposes `scriptProps` for things like
    // `data-*` attributes or the `type: 'application/json'` workaround.
    // We accept it for migration parity and forward onto the SSR tag.
    const html = renderToStaticMarkup(
      <ThemeProvider
        storage="local"
        nonce="abc123"
        scriptProps={{ id: 'theme-init', 'data-test': 'forwarded' } as never}
      >
        <Consumer />
      </ThemeProvider>,
    );
    expect(html).toContain('id="theme-init"');
    expect(html).toContain('data-test="forwarded"');
    // nonce is set by us LAST so user-supplied scriptProps cannot strip it.
    expect(html).toContain('nonce="abc123"');
  });

  it('honors a runtime forcedTheme prop change (route-group pattern)', () => {
    function App({ force }: { force?: string }) {
      return (
        <ThemeProvider
          storage="local"
          defaultTheme="light"
          enableSystem={false}
          forcedTheme={force}
        >
          <Consumer />
        </ThemeProvider>
      );
    }
    const { rerender } = render(<App />);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    rerender(<App force="dark" />);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    rerender(<App />);
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('useTheme.setTheme accepts an updater function', () => {
    function FnConsumer() {
      const { theme, setTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            toggle
          </button>
        </div>
      );
    }
    render(
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <FnConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    act(() => {
      fireEvent.click(screen.getByText('toggle'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    act(() => {
      fireEvent.click(screen.getByText('toggle'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('accepts the StorageConfig object form for the storage prop', () => {
    // The object form bundles mode + key; the resolved adapter should read/write
    // localStorage under the configured key.
    window.localStorage.setItem('my-theme-key', 'dark');
    render(
      <ThemeProvider
        storage={{ mode: 'local', key: 'my-theme-key' }}
        defaultTheme="light"
        enableSystem={false}
      >
        <Consumer />
      </ThemeProvider>,
    );
    // Seeded from the configured key, not the default 'theme'.
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    act(() => {
      fireEvent.click(screen.getByText('light'));
    });
    expect(window.localStorage.getItem('my-theme-key')).toBe('light');
    // The default key remains untouched.
    expect(window.localStorage.getItem('theme')).toBeNull();
  });
});
