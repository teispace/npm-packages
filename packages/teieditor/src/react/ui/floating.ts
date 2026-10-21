'use client';

import {
  autoUpdate,
  computePosition,
  flip,
  hide,
  type Middleware,
  offset,
  type Placement,
  shift,
  size,
  type VirtualElement,
} from '@floating-ui/dom';
import { type RefObject, useLayoutEffect } from 'react';

export type { Placement, VirtualElement };

/** What a floating element is placed against: an element, or a rectangle (a text selection). */
export type FloatingAnchor = Element | VirtualElement;

export interface FloatingOptions {
  placement?: Placement;
  /** Gap between anchor and floating element, in px. Default 6. */
  offset?: number;
  /** Keep at least this far from the viewport edges, in px. Default 8. */
  padding?: number;
  /** Make the floating element at least as wide as the anchor. */
  matchWidth?: boolean;
  /** Stay on the given side instead of flipping when there is no room. */
  noFlip?: boolean;
  /**
   * Flip when there is no room inside this element, not just the viewport:
   * a bubble over the first line goes below it rather than over a toolbar.
   */
  flipBoundary?: Element | null;
}

/**
 * Place `floating` next to `anchor` and keep it there through scrolling,
 * resizing and layout shifts, until `active` turns false.
 *
 * It writes `translate` and two custom properties through the CSSOM, which
 * a strict `style-src` allows, and `data-side` for side-aware styling.
 * `translate` leaves `transform` free for enter animations.
 */
export function positionFloating(
  anchor: FloatingAnchor,
  floating: HTMLElement,
  options: FloatingOptions = {},
): () => void {
  const { placement = 'bottom-start', padding = 8, matchWidth, noFlip, flipBoundary } = options;
  const middleware: Middleware[] = [
    offset(options.offset ?? 6),
    noFlip ? false : flip(flipBoundary ? { padding, boundary: flipBoundary } : { padding }),
    // Both axes: a submenu with no room on either side (a phone) slides over
    // its parent instead of off the screen.
    shift({ padding, crossAxis: true }),
    size({
      padding,
      apply({ availableHeight, availableWidth, rects, elements }) {
        const style = elements.floating.style;
        style.setProperty(
          '--tei-available-height',
          `${Math.max(96, Math.floor(availableHeight))}px`,
        );
        style.setProperty('--tei-available-width', `${Math.max(96, Math.floor(availableWidth))}px`);
        if (matchWidth) style.minWidth = `${Math.round(rects.reference.width)}px`;
      },
    }),
    hide({ padding }),
  ].filter(Boolean) as Middleware[];

  const update = () => {
    computePosition(anchor, floating, { strategy: 'fixed', placement, middleware }).then(
      ({ x, y, placement: side, middlewareData }) => {
        floating.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
        const edge = side.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
        floating.dataset.side = edge;
        // Grow out of the anchor, not the middle: the enter animation's
        // scale then leaves the edge next to the anchor where it is.
        const reference = anchor.getBoundingClientRect();
        const width = floating.offsetWidth;
        const height = floating.offsetHeight;
        const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
        const ox =
          edge === 'left'
            ? width
            : edge === 'right'
              ? 0
              : clamp(reference.left + reference.width / 2 - x, width);
        const oy =
          edge === 'top'
            ? height
            : edge === 'bottom'
              ? 0
              : clamp(reference.top + reference.height / 2 - y, height);
        floating.style.setProperty(
          '--tei-transform-origin',
          `${Math.round(ox)}px ${Math.round(oy)}px`,
        );
        floating.style.visibility = middlewareData.hide?.referenceHidden ? 'hidden' : '';
      },
    );
  };
  return autoUpdate(anchor, floating, update, { animationFrame: !(anchor instanceof Element) });
}

/** {@link positionFloating} as a hook. */
export function useFloating(
  anchor: FloatingAnchor | null | undefined,
  floating: RefObject<HTMLElement | null>,
  active: boolean,
  options: FloatingOptions = {},
): void {
  const { placement, offset: gap, padding, matchWidth, noFlip, flipBoundary } = options;
  useLayoutEffect(() => {
    const el = floating.current;
    if (!active || !anchor || !el) return;
    return positionFloating(anchor, el, {
      placement,
      offset: gap,
      padding,
      matchWidth,
      noFlip,
      flipBoundary,
    });
  }, [anchor, floating, active, placement, gap, padding, matchWidth, noFlip, flipBoundary]);
}
