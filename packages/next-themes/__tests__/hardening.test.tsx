import { act, render } from '@testing-library/react';
import { Activity, StrictMode, useEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCookieFromString, resolveAdapter } from '../src/adapters/index';
import { ScopedTheme } from '../src/components/scoped-theme';
import { ThemedImage } from '../src/components/themed-image';
import { buildScript } from '../src/core/script';
import { createStore } from '../src/core/store';
import type { StorageMode } from '../src/core/types';
import { useTheme } from '../src/hooks/use-theme';
import { useThemeEffect } from '../src/hooks/use-theme-effect';
import { ThemeProvider } from '../src/providers/client';

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

function hydrationErrors(): string[] {
  return errorSpy.mock.calls
    .map((c) => String(c[0]))
    .filter((m) => /hydrat|did not match|server.*client|mismatch/i.test(m));
}

/** Let MutationObserver callbacks (microtasks) run. */
const flush = () => act(async () => {});

describe('server snapshot on the client', () => {
  it('hydrates against what the server rendered, then reveals the stored theme', async () => {
    // The server never sees localStorage, so it renders the default theme.
    // The client's hydration render must agree; the stored theme arrives in
    // the re-render after hydration.
    const tree = (
      <ThemeProvider storage="local" defaultTheme="light" enableSystem={false}>
        <ThemedImage sources={{ light: '/light.png', dark: '/dark.png' }} alt="" />
      </ThemeProvider>
    );
    const html = renderToString(tree);
    expect(html).toContain('/light.png');

    window.localStorage.setItem('theme', 'dark');
    const container = document.createElement('div');
    container.innerHTML = html;
    await act(async () => {
      hydrateRoot(container, tree);
    });

    expect(hydrationErrors()).toEqual([]);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/dark.png');
  });

  it('getServerSnapshot ignores storage and the OS preference', () => {
    window.localStorage.setItem('theme', 'dark');
    const store = createStore({
      themes: ['light', 'dark'],
      defaultTheme: 'system',
      enableSystem: true,
      forcedTheme: null,
      initialTheme: null,
      followSystem: false,
      attribute: 'class',
      value: null,
      enableColorScheme: true,
      themeColor: null,
      disableTransitionOnChange: false,
      respectReducedMotion: true,
      target: 'html',
      storage: resolveAdapter({ mode: 'local', key: 'theme' }),
    });
    expect(store.getState().theme).toBe('dark');
    expect(store.getServerSnapshot()).toMatchObject({ theme: 'system', resolvedTheme: 'light' });
  });
});

function baseStore(theme: string, attribute: 'class' | 'data-theme' = 'class') {
  window.localStorage.setItem('theme', theme);
  return createStore({
    themes: ['light', 'dark'],
    defaultTheme: 'light',
    enableSystem: false,
    forcedTheme: null,
    initialTheme: null,
    followSystem: false,
    attribute,
    value: null,
    enableColorScheme: true,
    themeColor: null,
    disableTransitionOnChange: false,
    respectReducedMotion: true,
    target: 'html',
    storage: resolveAdapter({ mode: 'local', key: 'theme' }),
  });
}

describe('DOM guard', () => {
  it('restores the theme class when something rewrites className (upstream #351)', async () => {
    const store = baseStore('dark');
    store.mount();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // What React does when a layout re-renders <html className="font-sans">.
    document.documentElement.className = 'font-sans';
    await flush();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('font-sans')).toBe(true);
    store.unmount();
  });

  it('restores color-scheme when the style attribute is rewritten', async () => {
    const store = baseStore('dark');
    store.mount();
    document.documentElement.setAttribute('style', 'margin:0');
    await flush();
    expect(document.documentElement.style.colorScheme).toBe('dark');
    store.unmount();
  });

  it('two stores on one element do not fight: the last writer owns it', async () => {
    const a = baseStore('dark', 'data-theme');
    a.mount();
    const b = baseStore('light', 'data-theme');
    b.mount();
    await flush();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // `a` already holds 'dark'; a real switch makes it the writer again.
    a.setTheme('light');
    a.setTheme('dark');
    await flush();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    a.unmount();
    b.unmount();
  });

  it('stops restoring after an unrelated loop keeps rewriting the element', async () => {
    const store = baseStore('dark', 'data-theme');
    store.mount();
    const el = document.documentElement;
    let fights = 0;
    const hostile = new MutationObserver(() => {
      if (fights++ < 1000 && el.getAttribute('data-theme') !== 'x')
        el.setAttribute('data-theme', 'x');
    });
    hostile.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    el.setAttribute('data-theme', 'x');
    for (let i = 0; i < 60; i++) await flush();
    hostile.disconnect();
    expect(fights).toBeLessThan(100);
    store.unmount();
  });

  it('disconnects on unmount', async () => {
    const store = baseStore('dark');
    store.mount();
    store.unmount();
    document.documentElement.className = '';
    await flush();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('hooks', () => {
  it('useThemeEffect does not fire on mount under StrictMode', async () => {
    const effect = vi.fn();
    let setTheme: (t: string) => void = () => {};
    function Probe() {
      useThemeEffect(effect);
      setTheme = useTheme().setTheme;
      return null;
    }
    render(
      <StrictMode>
        <ThemeProvider storage="none" defaultTheme="light" enableSystem={false}>
          <Probe />
        </ThemeProvider>
      </StrictMode>,
    );
    await flush();
    expect(effect).not.toHaveBeenCalled();
    act(() => setTheme('dark'));
    expect(effect).toHaveBeenCalledWith('dark', 'dark');
  });

  it('useTheme keeps its identity across unrelated re-renders', async () => {
    const seen: unknown[] = [];
    let bump: () => void = () => {};
    function Probe() {
      const [, setN] = useState(0);
      bump = () => setN((n) => n + 1);
      seen.push(useTheme());
      return null;
    }
    render(
      <ThemeProvider storage="none" defaultTheme="light" enableSystem={false}>
        <Probe />
      </ThemeProvider>,
    );
    await flush();
    const before = seen.length;
    act(() => bump());
    expect(seen.length).toBe(before + 1);
    expect(seen.at(-1)).toBe(seen.at(-2));
  });
});

describe('ScopedTheme', () => {
  it('sets color-scheme through the CSSOM, never as a server style attribute', () => {
    const html = renderToString(
      <ScopedTheme theme="dark">
        <span />
      </ScopedTheme>,
    );
    expect(html).not.toContain('style=');
    const { container } = render(
      <ScopedTheme theme="dark">
        <span />
      </ScopedTheme>,
    );
    expect((container.firstElementChild as HTMLElement).style.colorScheme).toBe('dark');
  });

  it('leaves non light/dark themes and opted-out wrappers alone', () => {
    const { container } = render(
      <>
        <ScopedTheme theme="sepia">
          <span />
        </ScopedTheme>
        <ScopedTheme theme="dark" enableColorScheme={false}>
          <span />
        </ScopedTheme>
      </>,
    );
    const [a, b] = [...container.children] as HTMLElement[];
    expect(a?.style.colorScheme).toBe('');
    expect(b?.style.colorScheme).toBe('');
  });
});

describe('cookie parsing', () => {
  it('accepts headers joined with ";" and odd spacing', () => {
    expect(readCookieFromString('a=1;theme=dark', 'theme')).toBe('dark');
    expect(readCookieFromString('a=1;   theme=dark', 'theme')).toBe('dark');
    expect(readCookieFromString('a=1; theme=dark', 'theme')).toBe('dark');
  });
});

/** Run the inline script against the jsdom window. */
function runScript(script: string): void {
  new Function(script)();
}

describe('inline script and store agree on the starting theme', () => {
  const cases: Array<{
    name: string;
    mode: StorageMode;
    cookie?: string;
    local?: string;
    themes?: string[];
    defaultTheme?: string;
    initialTheme?: string;
    enableSystem?: boolean;
  }> = [
    { name: 'valid cookie', mode: 'hybrid', cookie: 'dark' },
    { name: 'invalid cookie, valid local (hybrid)', mode: 'hybrid', cookie: 'blue', local: 'dark' },
    {
      name: 'invalid stored value falls to initialTheme',
      mode: 'local',
      local: 'blue',
      initialTheme: 'dark',
    },
    { name: 'defaultTheme outside themes', mode: 'none', themes: ['a', 'b'], defaultTheme: 'zzz' },
    { name: 'system disabled but stored', mode: 'local', local: 'system', enableSystem: false },
    { name: 'system default', mode: 'none' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const themes = c.themes ?? ['light', 'dark'];
      const defaultTheme = c.defaultTheme ?? 'system';
      const enableSystem = c.enableSystem ?? true;
      if (c.cookie) document.cookie = `theme=${c.cookie}; Path=/`;
      if (c.local) window.localStorage.setItem('theme', c.local);

      runScript(
        buildScript({
          storageMode: c.mode,
          themes,
          defaultTheme,
          enableSystem,
          initialTheme: c.initialTheme ?? null,
        }),
      );
      const painted = document.documentElement.getAttribute('data-theme');

      const store = createStore({
        themes,
        defaultTheme,
        enableSystem,
        forcedTheme: null,
        initialTheme: c.initialTheme ?? null,
        followSystem: false,
        attribute: 'data-theme',
        value: null,
        enableColorScheme: true,
        themeColor: null,
        disableTransitionOnChange: false,
        respectReducedMotion: true,
        target: 'html',
        storage: resolveAdapter({ mode: c.mode, key: 'theme' }),
      });
      expect(painted).toBe(store.getState().resolvedTheme);
    });
  }
});

describe('React <Activity> (upstream #375)', () => {
  it('a revealed provider re-reads storage instead of re-applying its stale theme', async () => {
    let setA: (t: string) => void = () => {};
    let setB: (t: string) => void = () => {};
    let show: (which: 'a' | 'b') => void = () => {};
    function Grab({ into }: { into: (s: (t: string) => void) => void }) {
      const { setTheme } = useTheme();
      useEffect(() => into(setTheme), [into, setTheme]);
      return null;
    }
    function App() {
      const [visible, setVisible] = useState<'a' | 'b'>('a');
      show = setVisible;
      return (
        <>
          <Activity mode={visible === 'a' ? 'visible' : 'hidden'}>
            <ThemeProvider
              storage="local"
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
            >
              <Grab into={(s) => (setA = s)} />
            </ThemeProvider>
          </Activity>
          <Activity mode={visible === 'b' ? 'visible' : 'hidden'}>
            <ThemeProvider
              storage="local"
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
            >
              <Grab into={(s) => (setB = s)} />
            </ThemeProvider>
          </Activity>
        </>
      );
    }
    render(<App />);
    await flush();
    act(() => setA('dark'));
    act(() => show('b'));
    await flush();
    act(() => setB('light'));
    act(() => show('a'));
    await flush();
    expect(window.localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
