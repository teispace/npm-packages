import { getLastPointerPosition } from './cursor-tracker';
import { hasMatchMedia, isDom } from './env';
import type { TransitionConfig, TransitionOptions, TransitionOrigin } from './types';

const MEDIA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const STYLE_MARKER = 'data-teispace-vt';

export interface ResolvedTransition {
  css: string;
  duration: number;
}

/** Normalize any shorthand into a full options object, or `null` if disabled. */
function toOptions(config: TransitionConfig | undefined): TransitionOptions | null {
  if (!config || config === 'none') return null;
  if (config === true) return { type: 'fade' };
  if (typeof config === 'string') return { type: config };
  if (config.type === 'none') return null;
  return config;
}

function resolveOrigin(
  origin: TransitionOrigin | undefined,
  viewport: { w: number; h: number },
): { x: number; y: number } {
  if (origin && typeof origin === 'object') return origin;
  if (origin === 'center') return { x: viewport.w / 2, y: viewport.h / 2 };
  // default: cursor, fall back to center if no pointerdown has fired
  return getLastPointerPosition() ?? { x: viewport.w / 2, y: viewport.h / 2 };
}

export function resolveTransition(
  config: TransitionConfig | undefined,
  respectReducedMotion: boolean,
): ResolvedTransition | null {
  const opts = toOptions(config);
  if (!opts) return null;

  if (respectReducedMotion && hasMatchMedia()) {
    try {
      if (window.matchMedia(MEDIA_REDUCED_MOTION).matches) return null;
    } catch (_e) {
      /* ignore — proceed with transition */
    }
  }

  const duration = opts.duration ?? 250;
  const easing = opts.easing ?? 'ease';

  if (opts.css) return { css: opts.css, duration };

  const type = opts.type ?? 'fade';
  if (type === 'fade') return { css: fadeCss(duration, easing), duration };
  if (type === 'circular') {
    const viewport = {
      w: isDom() ? window.innerWidth : 1024,
      h: isDom() ? window.innerHeight : 768,
    };
    const origin = resolveOrigin(opts.origin, viewport);
    return { css: circularCss(origin, duration, easing), duration };
  }
  return null;
}

function fadeCss(duration: number, easing: string): string {
  return `
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: ${duration}ms;
  animation-timing-function: ${easing};
}`;
}

function circularCss(origin: { x: number; y: number }, duration: number, easing: string): string {
  const { x, y } = origin;
  return `
::view-transition-old(root) { animation: none; z-index: 1; mix-blend-mode: normal; }
::view-transition-new(root) {
  animation: teispace-theme-reveal ${duration}ms ${easing} both;
  z-index: 2;
  mix-blend-mode: normal;
}
@keyframes teispace-theme-reveal {
  from { clip-path: circle(0 at ${x}px ${y}px); }
  to { clip-path: circle(150vmax at ${x}px ${y}px); }
}`;
}

type StartViewTransitionFn = (cb: () => void | Promise<void>) =>
  | {
      ready?: Promise<void>;
      finished?: Promise<void>;
      updateCallbackDone?: Promise<void>;
      skipTransition?: () => void;
    }
  | undefined;

/**
 * Run `apply()` wrapped in a View Transition if supported; otherwise apply
 * synchronously. The transition CSS is injected into `<head>` for the
 * duration of the animation and torn down afterwards.
 */
export function startViewTransition(apply: () => void, transition: ResolvedTransition): void {
  const d = document as unknown as { startViewTransition?: StartViewTransitionFn };
  if (typeof d.startViewTransition !== 'function') {
    apply();
    return;
  }

  // Use a data-attribute marker instead of a fixed `id` so rapid successive
  // switches or nested providers can have multiple concurrent transitions
  // without colliding on id. Each call owns its own <style> element and
  // cleans it up via the direct reference.
  const style = document.createElement('style');
  style.setAttribute(STYLE_MARKER, '');
  style.appendChild(document.createTextNode(transition.css));
  document.head.appendChild(style);

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (style.parentNode) style.parentNode.removeChild(style);
  };

  const vt = d.startViewTransition(() => {
    apply();
  });

  if (vt?.finished && typeof vt.finished.then === 'function') {
    vt.finished.then(cleanup, cleanup);
  } else {
    window.setTimeout(cleanup, transition.duration + 50);
  }
}
