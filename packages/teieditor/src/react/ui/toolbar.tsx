'use client';

import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react';
import { usePartClass } from './context.js';

/** Controls the roving focus moves between; anything inside an open popover is excluded. */
const ITEMS = 'button,input,select,[data-tei-roving]';

function itemsOf(toolbar: HTMLElement): HTMLElement[] {
  return Array.from(toolbar.querySelectorAll<HTMLElement>(ITEMS)).filter(
    (el) =>
      !el.closest('.tei-popover, [popover], dialog') &&
      !(el as HTMLButtonElement).disabled &&
      el.closest('[role="toolbar"]') === toolbar,
  );
}

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** `wrap` onto more lines, or `scroll` sideways. Default: wrap, scroll in narrow editors. */
  overflow?: 'wrap' | 'scroll';
  /** Stick to the top of the scrolling container. */
  sticky?: boolean;
}

/**
 * A toolbar (WAI-ARIA toolbar pattern): one Tab stop, arrow keys between
 * controls, Home/End to the ends, mirrored in right-to-left text.
 */
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { overflow, sticky, className, onKeyDown, onFocus, children, ...rest },
  ref,
) {
  const local = useRef<HTMLDivElement | null>(null);
  const cls = usePartClass('toolbar', 'tei-toolbar', className);
  const active = useRef(0);

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      local.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  // One tab stop: the last focused control, or the first.
  useLayoutEffect(() => {
    const toolbar = local.current;
    if (!toolbar) return;
    const items = itemsOf(toolbar);
    const current = Math.min(active.current, items.length - 1);
    items.forEach((el, i) => {
      el.tabIndex = i === current ? 0 : -1;
    });
  });

  const focusAt = (items: HTMLElement[], index: number) => {
    const el = items[index];
    if (!el) return;
    items.forEach((item, i) => {
      item.tabIndex = i === index ? 0 : -1;
    });
    active.current = index;
    el.focus();
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div
      {...rest}
      ref={setRef}
      role="toolbar"
      aria-orientation="horizontal"
      className={cls}
      data-tei-part="toolbar"
      data-tei-ui=""
      data-overflow={overflow}
      data-sticky={sticky ? '' : undefined}
      onFocus={(event) => {
        const toolbar = local.current;
        if (toolbar) {
          const index = itemsOf(toolbar).indexOf(event.target as HTMLElement);
          if (index >= 0) active.current = index;
        }
        onFocus?.(event);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        const toolbar = local.current;
        if (event.defaultPrevented || !toolbar) return;
        const target = event.target as HTMLElement;
        if (target.closest('.tei-popover, [popover], dialog')) return;
        // Text inputs keep their own arrow keys.
        if (target instanceof HTMLInputElement && target.type !== 'checkbox') return;
        const items = itemsOf(toolbar);
        const index = items.indexOf(target);
        if (index < 0) return;
        const rtl = getComputedStyle(toolbar).direction === 'rtl';
        const next = rtl ? 'ArrowLeft' : 'ArrowRight';
        const prev = rtl ? 'ArrowRight' : 'ArrowLeft';
        let to = -1;
        if (event.key === next) to = (index + 1) % items.length;
        else if (event.key === prev) to = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = items.length - 1;
        if (to < 0) return;
        event.preventDefault();
        focusAt(items, to);
      }}
    >
      {children}
    </div>
  );
});

/** A divider between toolbar groups. */
export function Separator({
  orientation = 'vertical',
  className,
}: {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) {
  const cls = usePartClass('separator', 'tei-separator', className);
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cls}
      data-tei-part="separator"
    />
  );
}
