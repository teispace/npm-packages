import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import preset, { darkMode, themeVariant } from '../src/tailwind';

describe('Tailwind v4 CSS preset', () => {
  const css = readFileSync(join(__dirname, '..', 'tailwind.css'), 'utf-8');

  it('registers the dark custom-variant', () => {
    expect(css).toContain('@custom-variant dark');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('.dark');
  });

  it('registers the light custom-variant', () => {
    expect(css).toContain('@custom-variant light');
  });
});

describe('Tailwind v3 JS preset', () => {
  it('exports a darkMode config that covers both attribute modes', () => {
    expect(darkMode[0]).toBe('variant');
    const selectors = darkMode[1];
    expect(selectors.some((s) => s.includes('[data-theme="dark"]'))).toBe(true);
    expect(selectors.some((s) => s.includes('.dark'))).toBe(true);
  });

  it('themeVariant builds selectors for arbitrary themes', () => {
    const v = themeVariant('sepia');
    expect(v.some((s) => s.includes('[data-theme="sepia"]'))).toBe(true);
    expect(v.some((s) => s.includes('.sepia'))).toBe(true);
  });

  it('default export bundles darkMode', () => {
    expect(preset.darkMode).toBe(darkMode);
  });
});
