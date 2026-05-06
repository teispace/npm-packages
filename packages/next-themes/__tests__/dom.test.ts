import { describe, expect, it, vi } from 'vitest';
import { applyThemeColor, resolveTarget } from '../src/core/dom';

describe('resolveTarget', () => {
  it('returns the matched element for a valid selector', () => {
    expect(resolveTarget('html')).toBe(document.documentElement);
  });

  it('returns documentElement when the selector does not match', () => {
    expect(resolveTarget('#does-not-exist')).toBe(document.documentElement);
  });

  it('returns documentElement when the selector is invalid (DOMException)', () => {
    // Force querySelector to throw, simulating a malformed user-provided selector.
    const orig = document.querySelector.bind(document);
    const spy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
      throw new DOMException("'>>>' is not a valid selector", 'SyntaxError');
    });
    try {
      expect(resolveTarget('>>>')).toBe(document.documentElement);
    } finally {
      spy.mockRestore();
      void orig; // keep reference to avoid optimization
    }
  });
});

describe('applyThemeColor', () => {
  it('creates a meta tag with the marker attribute', () => {
    applyThemeColor('dark', 'dark', { dark: '#000', light: '#fff' });
    const meta = document.querySelector('meta[name="theme-color"][data-teispace-themes]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('#000');
  });

  it('removes the meta tag when themeColor becomes undefined', () => {
    applyThemeColor('dark', 'dark', { dark: '#000', light: '#fff' });
    expect(document.querySelector('meta[name="theme-color"][data-teispace-themes]')).not.toBeNull();
    applyThemeColor('dark', 'dark', undefined);
    expect(document.querySelector('meta[name="theme-color"][data-teispace-themes]')).toBeNull();
  });

  it('does not touch a developer-authored meta theme-color tag', () => {
    // Simulate a hand-rolled <meta> in the user's <head>.
    const handAuthored = document.createElement('meta');
    handAuthored.name = 'theme-color';
    handAuthored.setAttribute('content', '#abcdef');
    document.head.appendChild(handAuthored);
    try {
      applyThemeColor('dark', 'dark', undefined);
      expect(handAuthored.getAttribute('content')).toBe('#abcdef');
      expect(handAuthored.parentNode).toBe(document.head);
    } finally {
      handAuthored.remove();
    }
  });

  it('updates the existing owned meta on theme change', () => {
    applyThemeColor('dark', 'dark', { dark: '#000', light: '#fff' });
    applyThemeColor('light', 'light', { dark: '#000', light: '#fff' });
    const meta = document.querySelector('meta[name="theme-color"][data-teispace-themes]');
    expect(meta?.getAttribute('content')).toBe('#fff');
    // Still exactly one owned tag — no duplicates accumulated.
    expect(document.querySelectorAll('meta[name="theme-color"][data-teispace-themes]').length).toBe(
      1,
    );
  });
});
