import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCursorTracker } from '../src/core/cursor-tracker';
import { resolveTransition, startViewTransition } from '../src/core/view-transition';

beforeEach(() => {
  resetCursorTracker();
});

describe('resolveTransition', () => {
  it('returns null when disabled', () => {
    expect(resolveTransition(undefined, true)).toBeNull();
    expect(resolveTransition(false, true)).toBeNull();
    expect(resolveTransition('none', true)).toBeNull();
    expect(resolveTransition({ type: 'none' }, true)).toBeNull();
  });

  it('returns fade CSS for boolean true', () => {
    const r = resolveTransition(true, true);
    expect(r).not.toBeNull();
    expect(r?.css).toContain('::view-transition-old(root)');
    expect(r?.css).toContain('animation-duration: 250ms');
  });

  it('accepts a shorthand string', () => {
    const r = resolveTransition('fade', true);
    expect(r?.css).toContain('::view-transition-old(root)');
  });

  it('produces circular keyframes with cursor-origin fallback', () => {
    const r = resolveTransition('circular', true);
    expect(r?.css).toContain('@keyframes teispace-theme-reveal');
    expect(r?.css).toMatch(/circle\(0 at \d+(\.\d+)?px \d+(\.\d+)?px\)/);
  });

  it('respects explicit origin coordinates', () => {
    const r = resolveTransition({ type: 'circular', origin: { x: 10, y: 20 } }, true);
    expect(r?.css).toContain('circle(0 at 10px 20px)');
  });

  it('honors custom duration and easing', () => {
    const r = resolveTransition({ type: 'fade', duration: 600, easing: 'linear' }, true);
    expect(r?.css).toContain('animation-duration: 600ms');
    expect(r?.css).toContain('animation-timing-function: linear');
  });

  it('returns the user-provided css when supplied', () => {
    const custom = '::view-transition-old(root) { animation: spin 1s; }';
    const r = resolveTransition({ type: 'custom' as never, css: custom }, true);
    expect(r?.css).toBe(custom);
  });

  it('returns null when prefers-reduced-motion is reduce and respectReducedMotion is true', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      expect(resolveTransition('fade', true)).toBeNull();
      expect(resolveTransition('fade', false)).not.toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('startViewTransition', () => {
  afterEach(() => {
    const d = document as unknown as { startViewTransition?: unknown };
    d.startViewTransition = undefined;
  });

  it('applies synchronously when startViewTransition is unsupported', () => {
    const spy = vi.fn();
    startViewTransition(spy, { css: '.x {}', duration: 100 });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('wraps the apply in startViewTransition and injects CSS', () => {
    const applied: string[] = [];
    let capturedCb: (() => void) | undefined;
    const finishedResolvers: (() => void)[] = [];
    const finished = new Promise<void>((resolve) => {
      finishedResolvers.push(resolve);
    });
    const vt = { finished };
    (
      document as unknown as { startViewTransition: (cb: () => void) => typeof vt }
    ).startViewTransition = (cb: () => void) => {
      capturedCb = cb;
      return vt;
    };

    startViewTransition(
      () => {
        applied.push('yes');
      },
      { css: '::view-transition-old(root) { animation: none; }', duration: 120 },
    );

    // CSS was injected with the data-marker, not a fixed id
    expect(document.head.querySelector('style[data-teispace-vt]')).not.toBeNull();
    // startViewTransition received the apply callback; invoke it to simulate
    expect(typeof capturedCb).toBe('function');
    capturedCb?.();
    expect(applied).toEqual(['yes']);

    // Resolve finished; cleanup should remove the style
    finishedResolvers[0]();
    return finished.then(() => {
      // Microtask flush
      return Promise.resolve().then(() => {
        expect(document.head.querySelector('style[data-teispace-vt]')).toBeNull();
      });
    });
  });

  it('concurrent calls produce independent style elements (no id collision)', () => {
    const calls: Array<() => void> = [];
    (
      document as unknown as {
        startViewTransition: (cb: () => void) => { finished: Promise<void> };
      }
    ).startViewTransition = (cb: () => void) => {
      calls.push(cb);
      return { finished: new Promise<void>(() => {}) };
    };

    startViewTransition(() => {}, { css: '.a {}', duration: 100 });
    startViewTransition(() => {}, { css: '.b {}', duration: 100 });
    startViewTransition(() => {}, { css: '.c {}', duration: 100 });

    const styles = document.head.querySelectorAll('style[data-teispace-vt]');
    expect(styles.length).toBe(3);
    // None share an id (no `id` attribute set at all).
    for (const s of Array.from(styles)) {
      expect(s.id).toBe('');
    }
  });
});
