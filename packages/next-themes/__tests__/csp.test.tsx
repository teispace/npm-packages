import { createHash } from 'node:crypto';
import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdapter } from '../src/adapters/index';
import { disableTransition, injectStyle } from '../src/core/dom';
import {
  buildScript,
  getScriptConfig,
  THEME_SCRIPT,
  THEME_SCRIPT_ATTRIBUTE,
  THEME_SCRIPT_HASH,
} from '../src/core/script';
import { createStore } from '../src/core/store';
import { startViewTransition } from '../src/core/view-transition';
import { ThemeProvider } from '../src/providers/client';
import { getThemeScriptHash, getThemeScriptProps } from '../src/server/get-theme';

/**
 * Strict-CSP behaviour (upstream next-themes #303): every stylesheet the
 * package injects must either be a constructable sheet, which `style-src`
 * does not govern, or a `<style>` carrying the page nonce.
 */

type SheetDoc = Document & { adoptedStyleSheets: CSSStyleSheet[] };

/** jsdom lacks `adoptedStyleSheets`; install a working one for a test. */
function installAdoptedStyleSheets(): () => void {
  let sheets: CSSStyleSheet[] = [];
  Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get: () => sheets,
    set: (next: CSSStyleSheet[]) => {
      sheets = [...next];
    },
  });
  return () => {
    delete (Document.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
  };
}

function ownedStyles(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>('style[data-teispace-themes]')];
}

beforeEach(() => {
  for (const s of ownedStyles()) s.remove();
});

describe('injectStyle', () => {
  it('adopts a constructable sheet when the engine supports it, and adds no <style>', () => {
    const uninstall = installAdoptedStyleSheets();
    try {
      const remove = injectStyle('a{color:red}', 'n0nce');
      const sheets = (document as SheetDoc).adoptedStyleSheets;
      expect(sheets).toHaveLength(1);
      expect(sheets[0]?.cssRules[0]?.cssText).toContain('color: red');
      expect(ownedStyles()).toHaveLength(0);
      remove();
      expect((document as SheetDoc).adoptedStyleSheets).toHaveLength(0);
    } finally {
      uninstall();
    }
  });

  it('removes exactly its own sheet, keeping sheets adopted before and after it', () => {
    const uninstall = installAdoptedStyleSheets();
    try {
      const doc = document as SheetDoc;
      const before = new CSSStyleSheet();
      doc.adoptedStyleSheets = [before];
      const remove = injectStyle('a{color:red}');
      const after = new CSSStyleSheet();
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, after];
      remove();
      expect(doc.adoptedStyleSheets).toEqual([before, after]);
    } finally {
      uninstall();
    }
  });

  it('falls back to a <style> with the nonce *property* when sheets are unsupported', () => {
    const remove = injectStyle('a{color:red}', 'n0nce');
    const [style] = ownedStyles();
    expect(style).toBeDefined();
    expect(style?.nonce).toBe('n0nce');
    expect(style?.textContent).toBe('a{color:red}');
    remove();
    expect(ownedStyles()).toHaveLength(0);
  });

  it('adds no nonce when none is given (unchanged behaviour)', () => {
    const remove = injectStyle('a{color:red}');
    expect(ownedStyles()[0]?.nonce).toBe('');
    remove();
  });
});

describe('disableTransition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never leaves its stylesheet behind when animation frames never fire', () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const restore = disableTransition(true, false, 'n0nce');
    expect(ownedStyles()).toHaveLength(1);
    expect(ownedStyles()[0]?.nonce).toBe('n0nce');
    restore();
    vi.advanceTimersByTime(119);
    expect(ownedStyles()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ownedStyles()).toHaveLength(0);
    raf.mockRestore();
  });

  it('removes its constructable sheet after the double animation frame', () => {
    const uninstall = installAdoptedStyleSheets();
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    try {
      const restore = disableTransition(true, false);
      expect((document as SheetDoc).adoptedStyleSheets).toHaveLength(1);
      restore();
      frames.shift()?.(0);
      frames.shift()?.(0);
      expect((document as SheetDoc).adoptedStyleSheets).toHaveLength(0);
    } finally {
      raf.mockRestore();
      uninstall();
    }
  });
});

function storeOptions() {
  return {
    themes: ['light', 'dark'],
    defaultTheme: 'light',
    enableSystem: false,
    forcedTheme: null,
    initialTheme: null,
    followSystem: false,
    attribute: 'class' as const,
    value: null,
    enableColorScheme: true,
    themeColor: null,
    disableTransitionOnChange: true,
    respectReducedMotion: false,
    target: 'html',
    storage: resolveAdapter({ mode: 'local', key: 'theme' }),
  };
}

/** Record every `<style>` appended to <head> while `fn` runs. */
function capturedStyles(fn: () => void): HTMLStyleElement[] {
  const seen: HTMLStyleElement[] = [];
  const append = document.head.appendChild.bind(document.head);
  const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLStyleElement) seen.push(node);
    return append(node);
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return seen;
}

describe('the store threads the nonce into every injected style', () => {
  it('disableTransitionOnChange', () => {
    const store = createStore({ ...storeOptions(), nonce: 'n0nce' });
    store.mount();
    const styles = capturedStyles(() => store.setTheme('dark'));
    store.unmount();
    expect(styles).toHaveLength(1);
    expect(styles[0]?.nonce).toBe('n0nce');
  });

  it('view transitions', () => {
    const doc = document as Document & { startViewTransition?: unknown };
    doc.startViewTransition = (cb: () => void) => {
      cb();
      return { finished: new Promise(() => {}) };
    };
    try {
      const store = createStore({
        ...storeOptions(),
        disableTransitionOnChange: false,
        transition: 'fade',
        nonce: 'n0nce',
      });
      store.mount();
      const styles = capturedStyles(() => store.setTheme('dark'));
      store.unmount();
      expect(styles).toHaveLength(1);
      expect(styles[0]?.nonce).toBe('n0nce');
    } finally {
      delete doc.startViewTransition;
    }
  });

  it('startViewTransition passes its nonce straight through', () => {
    const doc = document as Document & { startViewTransition?: unknown };
    doc.startViewTransition = (cb: () => void) => {
      cb();
      return { finished: new Promise(() => {}) };
    };
    try {
      const styles = capturedStyles(() =>
        startViewTransition(() => {}, { css: 'a{}', duration: 1, typeName: 'dark' }, 'n0nce'),
      );
      expect(styles[0]?.nonce).toBe('n0nce');
    } finally {
      delete doc.startViewTransition;
    }
  });
});

/**
 * Execute a script the way a browser would for an inline `<script>`: with
 * `document.currentScript` pointing at the element. Free identifiers resolve
 * against the jsdom window.
 */
function runAsCurrentScript(el: HTMLScriptElement, text: string): void {
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => el });
  try {
    new Function(text)();
  } finally {
    delete (document as { currentScript?: unknown }).currentScript;
  }
}

function scriptElement(config: string, nonce?: string): HTMLScriptElement {
  const el = document.createElement('script');
  el.setAttribute(THEME_SCRIPT_ATTRIBUTE, config);
  if (nonce) el.nonce = nonce;
  return el;
}

describe('the inline script', () => {
  it('has a constant text whose published hash is current', () => {
    const digest = createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64');
    expect(THEME_SCRIPT_HASH).toBe(`'sha256-${digest}'`);
    expect(getThemeScriptHash()).toBe(THEME_SCRIPT_HASH);
  });

  it('stays inside its byte budget', () => {
    // The pre-CSP script (3.0.2) was ~2.97 kB for the default config; the
    // brief allows +300 bytes.
    expect(THEME_SCRIPT.length + getScriptConfig({}).length).toBeLessThan(3270);
    expect(buildScript({}).length).toBeLessThan(3270);
  });

  it('captures its own nonce from document.currentScript once, up front', () => {
    expect(THEME_SCRIPT).toMatch(/^!function\(\)\{try\{var s=document\.currentScript,/);
    expect(THEME_SCRIPT).toContain('nn=s&&s.nonce');
  });

  it('reads its config from the attribute and applies the theme', () => {
    document.cookie = 'theme=dark; Path=/';
    runAsCurrentScript(scriptElement(getScriptConfig({ attribute: 'class' })), THEME_SCRIPT);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('stamps its transition-disabling <style> with the script nonce', () => {
    document.cookie = 'theme=dark; Path=/';
    const styles = capturedStyles(() =>
      runAsCurrentScript(
        scriptElement(
          getScriptConfig({ attribute: 'class', disableTransitionOnChange: true }),
          'n0nce',
        ),
        THEME_SCRIPT,
      ),
    );
    expect(styles).toHaveLength(1);
    expect(styles[0]?.nonce).toBe('n0nce');
  });

  it('prefers a constructable sheet when the engine has one', () => {
    const uninstall = installAdoptedStyleSheets();
    try {
      document.cookie = 'theme=dark; Path=/';
      const styles = capturedStyles(() =>
        runAsCurrentScript(
          scriptElement(getScriptConfig({ attribute: 'class', disableTransitionOnChange: true })),
          THEME_SCRIPT,
        ),
      );
      expect(styles).toHaveLength(0);
      expect((document as SheetDoc).adoptedStyleSheets).toHaveLength(1);
    } finally {
      uninstall();
    }
  });

  it('the inline-config form behaves the same', () => {
    document.cookie = 'theme=dark; Path=/';
    runAsCurrentScript(document.createElement('script'), buildScript({ attribute: 'class' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('the rendered <script>', () => {
  it('providers render the constant text plus config, nonce and the Rocket Loader opt-out', () => {
    const html = renderToString(
      <ThemeProvider nonce="n0nce" attribute="class">
        <span />
      </ThemeProvider>,
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    const script = host.querySelector('script');
    expect(script?.textContent).toBe(THEME_SCRIPT);
    expect(script?.getAttribute('nonce')).toBe('n0nce');
    expect(script?.getAttribute('data-cfasync')).toBe('false');
    expect(JSON.parse(script?.getAttribute(THEME_SCRIPT_ATTRIBUTE) ?? '')).toMatchObject({
      a: ['class'],
    });
  });

  it('getThemeScriptProps produces the same element for a custom <head> placement', () => {
    const props = getThemeScriptProps({ attribute: 'class', nonce: 'n0nce' });
    expect(props.dangerouslySetInnerHTML.__html).toBe(THEME_SCRIPT);
    expect(props.nonce).toBe('n0nce');
    expect(props['data-cfasync']).toBe('false');
    expect(JSON.parse(props[THEME_SCRIPT_ATTRIBUTE])).toMatchObject({ a: ['class'] });
    expect('nonce' in getThemeScriptProps({})).toBe(false);
  });

  it('a client-side render never emits a script (no Trusted Types sink is touched)', async () => {
    const { container } = render(
      <ThemeProvider nonce="n0nce">
        <span />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(container.querySelector('script')).toBeNull();
  });
});
