import { describe, expect, it } from 'vitest';
import {
  isSafeFileUrl,
  isSafeImageSrc,
  isSafeUrl,
  safeUrl,
  withDefaultScheme,
} from '../../src/utils/url';

describe('isSafeUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c#d',
    'HTTPS://EXAMPLE.COM',
    'mailto:someone@example.com',
    'tel:+15550100',
    '  https://example.com  ',
    '/docs/intro',
    '#section',
    '?page=2',
    'page.html',
  ])('accepts %j', (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'javascript\u0000:alert(1)',
    '\u001fjavascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,iVBORw0KGgo=',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'file:///etc/passwd',
    'ftp://example.com',
    'blob:https://example.com/uuid',
    '',
    '   ',
  ])('refuses %j', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it('can refuse relative references', () => {
    expect(isSafeUrl('/docs', { allowRelative: false })).toBe(false);
  });

  it('refuses a non-string without throwing', () => {
    expect(isSafeUrl(undefined as unknown as string)).toBe(false);
  });
});

describe('safeUrl', () => {
  it('returns the trimmed URL or an inert fallback', () => {
    expect(safeUrl(' https://example.com ')).toBe('https://example.com');
    expect(safeUrl('javascript:alert(1)')).toBe('about:blank');
    expect(safeUrl('javascript:alert(1)', undefined, '#')).toBe('#');
  });
});

describe('isSafeImageSrc', () => {
  it.each([
    'https://example.com/a.png',
    'blob:https://example.com/0f6b',
    'data:image/png;base64,iVBORw0KGgo=',
    'DATA:IMAGE/SVG+XML,<svg/>',
    '/uploads/a.png',
  ])('accepts %j', (src) => {
    expect(isSafeImageSrc(src)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:,hello',
    'mailto:a@example.com',
    '//evil.example/a.png',
  ])('refuses %j', (src) => {
    expect(isSafeImageSrc(src)).toBe(false);
  });
});

describe('isSafeFileUrl', () => {
  it.each([
    'https://example.com/report.pdf',
    'data:application/pdf;base64,JVBERi0=',
    'data:application/zip;base64,UEsDBA==',
  ])('accepts %j', (url) => {
    expect(isSafeFileUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'data:application/xhtml+xml,<x/>',
  ])('refuses %j, which a browser would run script from', (url) => {
    expect(isSafeFileUrl(url)).toBe(false);
  });
});

describe('withDefaultScheme', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['example.com/path', 'https://example.com/path'],
    ['example.com:8080/x', 'https://example.com:8080/x'],
    ['localhost:3000', 'https://localhost:3000'],
    ['  https://example.com ', 'https://example.com'],
    ['mailto:a@example.com', 'mailto:a@example.com'],
    ['tel:5550100', 'tel:5550100'],
    ['/docs', '/docs'],
    ['#top', '#top'],
  ])('%j becomes %j', (input, expected) => {
    expect(withDefaultScheme(input)).toBe(expected);
  });

  it('leaves a dangerous scheme recognisable, so it is refused rather than disguised', () => {
    const typed = withDefaultScheme('javascript:alert(1)');
    expect(typed).toBe('javascript:alert(1)');
    expect(isSafeUrl(typed)).toBe(false);
  });
});
