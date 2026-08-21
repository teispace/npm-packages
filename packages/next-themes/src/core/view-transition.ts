import { getLastPointerPosition } from './cursor-tracker';
import { hasMatchMedia, isDom } from './env';
import type { TransitionConfig, TransitionOptions, TransitionOrigin } from './types';

const MEDIA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const STYLE_MARKER = 'data-teispace-vt';

export interface ResolvedTransition {
  css: string;
  duration: number;
  /**
   * A second view-transition type naming the resolved theme (e.g. `'dark'`), so
   * CSS can distinguish "switching to dark" from "switching to light" without
   * reading any attribute.
   */
  typeName: string;
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
  /** The concrete theme being switched to; surfaced as a view-transition type. */
  typeName = 'theme',
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

  if (opts.css) return { css: opts.css, duration, typeName };

  const type = opts.type ?? 'fade';
  if (type === 'fade') return { css: fadeCss(duration, easing), duration, typeName };
  if (type === 'circular') {
    const viewport = {
      w: isDom() ? window.innerWidth : 1024,
      h: isDom() ? window.innerHeight : 768,
    };
    const origin = resolveOrigin(opts.origin, viewport);
    return { css: circularCss(origin, duration, easing), duration, typeName };
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

interface ViewTransitionHandle {
  ready?: Promise<void>;
  finished?: Promise<void>;
  updateCallbackDone?: Promise<void>;
  skipTransition?: () => void;
}

/**
 * Both call shapes of the API. The callback form is View Transitions level 1;
 * the options form (level 2) adds `types`, which stamps the transition so CSS
 * can target it with `:active-view-transition-type()`.
 */
type StartViewTransitionFn = (
  cbOrOptions:
    | (() => void | Promise<void>)
    | { update: () => void | Promise<void>; types?: string[] },
) => ViewTransitionHandle | undefined;

/** The transition type we stamp on every theme change. */
const VT_TYPE = 'theme';

/**
 * Whether the engine supports View Transition *types*.
 *
 * Detected via `:active-view-transition-type()` selector support rather than
 * the arity of `startViewTransition`, because passing an options object to an
 * engine that only implements level 1 does not throw — it silently treats the
 * object as the callback and the transition never runs. Selector support is the
 * honest proxy for "this engine understands types", and it is exactly what a
 * consumer would write CSS against.
 *
 * Cross-browser as of 2026 (Chrome/Edge 125, Safari 18.2, Firefox 147).
 */
function supportsTransitionTypes(): boolean {
  try {
    return (
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('selector(:active-view-transition-type(theme))')
    );
  } catch {
    return false;
  }
}

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

  // Each call owns its own <style> element. Marker attribute (not `id`) so
  // rapid successive switches or nested providers don't collide. The marker
  // also lets external test harnesses or debug overlays find these tags.
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

  // Stamp the transition with a type when the engine supports it, so consumers
  // can style theme changes from their own stylesheet:
  //
  //   :root(:active-view-transition-type(theme)) &::view-transition-old(root) { ... }
  //
  // We still inject our own <style> for the built-in fade/circular animations;
  // the type is additive and costs nothing when unused.
  const vt = supportsTransitionTypes()
    ? d.startViewTransition({ update: () => apply(), types: [VT_TYPE, transition.typeName] })
    : d.startViewTransition(() => {
        apply();
      });

  if (vt?.finished && typeof vt.finished.then === 'function') {
    vt.finished.then(cleanup, cleanup);
  } else {
    window.setTimeout(cleanup, transition.duration + 50);
  }
}
