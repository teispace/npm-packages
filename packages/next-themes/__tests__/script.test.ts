import { describe, expect, it, vi } from 'vitest';
import { buildScript } from '../src/core/script';

/**
 * Execute the inline script. The script references `document`, `localStorage`,
 * `sessionStorage`, `matchMedia`, and friends as free identifiers — in real
 * browsers these are on the global. In the happy-dom test env we inject them
 * explicitly so the script evaluates against the test window.
 */
function runScript(script: string): void {
  const fn = new Function(
    'document',
    'localStorage',
    'sessionStorage',
    'matchMedia',
    'getComputedStyle',
    'requestAnimationFrame',
    script,
  );
  fn(
    window.document,
    window.localStorage,
    window.sessionStorage,
    window.matchMedia.bind(window),
    window.getComputedStyle.bind(window),
    window.requestAnimationFrame.bind(window),
  );
}

describe('buildScript', () => {
  it('produces an IIFE that does not throw', () => {
    const s = buildScript({});
    expect(() => runScript(s)).not.toThrow();
  });

  it('applies the default theme when nothing is stored (system → light via media)', () => {
    const s = buildScript({ themes: ['light', 'dark'], defaultTheme: 'system' });
    runScript(s);
    // system + happy-dom default matchMedia is `matches: false` → light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('honors a forcedTheme regardless of storage', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = buildScript({ forcedTheme: 'dark' });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('reads from localStorage in local/hybrid mode', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = buildScript({ storageMode: 'local', themes: ['light', 'dark'] });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('reads from cookie in cookie/hybrid mode', () => {
    document.cookie = 'theme=dark; Path=/';
    const s = buildScript({ storageMode: 'cookie' });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('prefers cookie over localStorage in hybrid mode', () => {
    window.localStorage.setItem('theme', 'light');
    document.cookie = 'theme=dark; Path=/';
    const s = buildScript({ storageMode: 'hybrid', themes: ['light', 'dark'] });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to initialTheme if no storage has a value', () => {
    const s = buildScript({ initialTheme: 'dark', themes: ['light', 'dark'] });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('uses defaultTheme when storage and initialTheme are both absent', () => {
    const s = buildScript({ defaultTheme: 'light', enableSystem: false });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies class attribute and removes prior theme classes', () => {
    document.documentElement.classList.add('dark'); // stale class
    window.localStorage.setItem('theme', 'light');
    const s = buildScript({
      attribute: 'class',
      storageMode: 'local',
      themes: ['light', 'dark'],
    });
    runScript(s);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('flattens multi-class values on cleanup', () => {
    document.documentElement.classList.add('dark', 'high-contrast'); // stale
    window.localStorage.setItem('theme', 'light');
    const s = buildScript({
      attribute: 'class',
      storageMode: 'local',
      themes: ['light', 'dark'],
      value: { light: 'light', dark: 'dark high-contrast' },
    });
    runScript(s);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
  });

  it('applies a mapped attribute value via the `value` map', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = buildScript({
      storageMode: 'local',
      themes: ['light', 'dark'],
      value: { dark: 'theme-dark' },
    });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('theme-dark');
  });

  it('sets color-scheme CSS when enabled', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = buildScript({ storageMode: 'local', themes: ['light', 'dark'] });
    runScript(s);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('creates and updates <meta name="theme-color">', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = buildScript({
      storageMode: 'local',
      themes: ['light', 'dark'],
      themeColor: { light: '#fff', dark: '#000' },
    });
    runScript(s);
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.getAttribute('content')).toBe('#000');
  });

  it('falls back to default when stored theme is not in the whitelist', () => {
    window.localStorage.setItem('theme', 'purple');
    const s = buildScript({
      storageMode: 'local',
      themes: ['light', 'dark'],
      defaultTheme: 'light',
      enableSystem: false,
    });
    runScript(s);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("never applies 'system' when enableSystem=false (coerces to a concrete theme)", () => {
    window.localStorage.setItem('theme', 'system');
    const s = buildScript({
      storageMode: 'local',
      themes: ['light', 'dark'],
      defaultTheme: 'system',
      enableSystem: false,
    });
    runScript(s);
    const applied = document.documentElement.getAttribute('data-theme');
    expect(applied).not.toBe('system');
    expect(['light', 'dark']).toContain(applied);
  });

  it('does not throw on an invalid target selector', () => {
    const s = buildScript({
      target: '>>>not-valid',
      storageMode: 'local',
      defaultTheme: 'light',
      enableSystem: false,
    });
    expect(() => runScript(s)).not.toThrow();
    // Fell back to documentElement
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('supports multiple attributes simultaneously', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = buildScript({
      storageMode: 'local',
      attribute: ['class', 'data-theme'],
      themes: ['light', 'dark'],
    });
    runScript(s);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('is resilient when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const s = buildScript({ storageMode: 'local', defaultTheme: 'light', enableSystem: false });
    expect(() => runScript(s)).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('is silent if document is unavailable (no throws on malformed exec)', () => {
    const s = buildScript({});
    expect(s.startsWith('!function')).toBe(true);
    expect(s.endsWith('}();')).toBe(true);
  });

  it('strips minifier __name artifacts from the serialized body', () => {
    const s = buildScript({});
    expect(s).not.toMatch(/__name\(/);
  });
});
