'use client';

import {
  forwardRef,
  type HTMLAttributes,
  type MutableRefObject,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { usePartClass } from './context.js';
import { type FloatingAnchor, type FloatingOptions, useFloating } from './floating.js';

export type DismissReason = 'escape' | 'outside' | 'select';

export interface PopoverProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'>,
    FloatingOptions {
  open: boolean;
  /** What it is placed against: an element, or a rectangle such as a text selection. */
  anchor: FloatingAnchor | null | undefined;
  /** Called when the popover asks to close (Escape, a press outside). */
  onDismiss?: (reason: DismissReason) => void;
  /** Close on a press outside it and its anchor. Default true. */
  dismissOnOutside?: boolean;
  /** Where focus goes on open: the popover itself, its first control, or nowhere (default). */
  initialFocus?: 'container' | 'first' | 'none';
  /** Return focus to the anchor when it closes with focus inside. Default: when `initialFocus` moved it. */
  restoreFocus?: boolean;
  /** `bar` lays children out in a row (the bubble menu). */
  variant?: 'bar';
  children?: React.ReactNode;
}

/** Open layers in the order they opened. */
const layers: HTMLElement[] = [];
/** Each layer's dismiss handler; a layer without one (a passive bar) never takes Escape. */
const handlers = new WeakMap<HTMLElement, { current: PopoverProps['onDismiss'] }>();

/**
 * The layer Escape belongs to: the latest dismissable one with no open
 * dismissable layer inside it. Nesting decides first because a nested
 * popover's effect runs, and so registers, before its parent's.
 */
function innermost(): HTMLElement | undefined {
  const open = layers.filter((layer) => handlers.get(layer)?.current);
  for (let i = open.length - 1; i >= 0; i--) {
    const layer = open[i] as HTMLElement;
    if (!open.some((other) => other !== layer && layer.contains(other))) return layer;
  }
  return undefined;
}

function setRef<T>(ref: Ref<T> | undefined, value: T): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as MutableRefObject<T>).current = value;
}

/** `:popover-open`, where the browser knows it (jsdom does not). */
function isShown(node: HTMLElement): boolean {
  try {
    return node.matches(':popover-open');
  } catch {
    return false;
  }
}

const FOCUSABLE =
  'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';

/**
 * A floating surface in the browser's top layer (the `popover` attribute):
 * never clipped by an ancestor's `overflow`, never under someone's
 * `z-index`. It stays where it is rendered in the DOM, so it inherits the
 * editor's tokens and React context, and events bubble as usual.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  {
    open,
    anchor,
    onDismiss,
    dismissOnOutside = true,
    initialFocus = 'none',
    restoreFocus,
    variant,
    placement,
    offset,
    padding,
    matchWidth,
    noFlip,
    flipBoundary,
    inside,
    className,
    children,
    ...rest
  },
  ref,
) {
  const el = useRef<HTMLDivElement | null>(null);
  const cls = usePartClass('popover', 'tei-popover tei-portal', className);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const setEl = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      setRef(ref, node);
    },
    [ref],
  );

  useFloating(anchor, el, open, {
    placement,
    offset,
    padding,
    matchWidth,
    noFlip,
    flipBoundary,
    inside,
  });

  // Into the top layer, and focus where asked; on close, focus back to the anchor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the anchor only says where focus returns; re-running on it would re-focus
  useLayoutEffect(() => {
    const node = el.current;
    if (!open || !node) return;
    if (node.isConnected && typeof node.showPopover === 'function' && !isShown(node)) {
      node.showPopover();
    }
    layers.push(node);
    handlers.set(node, dismiss);
    const doc = node.ownerDocument;
    const previous = doc.activeElement as HTMLElement | null;
    if (initialFocus === 'container') node.focus({ preventScroll: true });
    else if (initialFocus === 'first')
      (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus({ preventScroll: true });
    const restore = restoreFocus ?? initialFocus !== 'none';
    return () => {
      layers.splice(layers.indexOf(node), 1);
      // Focus inside, or dropped to <body> with this popover's DOM: give it back.
      // Focus an action moved elsewhere on purpose (into the editor) stays there.
      const active = doc.activeElement;
      const hadFocus = node.contains(active) || active === doc.body || active === null;
      if (typeof node.hidePopover === 'function' && isShown(node)) node.hidePopover();
      if (restore && hadFocus) {
        const target = anchor instanceof HTMLElement ? anchor : previous;
        target?.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocus, restoreFocus]);

  useEffect(() => {
    const node = el.current;
    if (!open || !node) return;
    const doc = node.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || innermost() !== node) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss.current?.('escape');
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || node.contains(target)) return;
      if (anchor instanceof Element && anchor.contains(target)) return;
      // A press in another layer belongs to that layer, unless it is one this popover sits in.
      if (layers.some((layer) => layer !== node && layer.contains(target) && !layer.contains(node)))
        return;
      dismiss.current?.('outside');
    };
    doc.addEventListener('keydown', onKeyDown, true);
    if (dismissOnOutside) doc.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, anchor, dismissOnOutside]);

  if (!open) return null;
  return (
    <div
      {...rest}
      ref={setEl}
      popover="manual"
      tabIndex={initialFocus === 'container' ? -1 : rest.tabIndex}
      className={cls}
      data-tei-part="popover"
      data-tei-ui=""
      data-open=""
      data-variant={variant}
    >
      {children}
    </div>
  );
});
