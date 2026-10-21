'use client';

import {
  type ButtonHTMLAttributes,
  type FocusEvent,
  forwardRef,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { TeiIconLike } from './context.js';
import { usePartClass } from './context.js';
import { Icon } from './icon.js';
import { hideTooltip, showTooltip } from './tooltip.js';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'outline' | 'solid' | 'danger';
  size?: 'sm' | 'md';
  /** An icon name or icon. With no children it becomes an icon-only button. */
  icon?: string | TeiIconLike;
  /**
   * The accessible name, shown as a tooltip. For icon-only buttons it is
   * required; with visible text it adds a tooltip and nothing else.
   */
  label?: string;
  /** Key hint for the tooltip, already formatted: `['⌘', 'B']` or `'⌘B'`. */
  shortcut?: readonly string[] | string;
  /** Toggle state; sets `aria-pressed`. */
  pressed?: boolean;
  /** A trailing chevron, for buttons that open a menu. */
  chevron?: boolean;
  children?: ReactNode;
}

function shortcutText(shortcut: ButtonProps['shortcut']): string | undefined {
  if (!shortcut) return undefined;
  return typeof shortcut === 'string' ? shortcut : shortcut.join(shortcut.includes('⌘') ? '' : '+');
}

/**
 * The button every teieditor control is made of. Keeps editor focus: a
 * mouse press does not move focus out of the document, so the selection a
 * toolbar command acts on is still there when it runs.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    icon,
    label,
    shortcut,
    pressed,
    chevron,
    className,
    children,
    type = 'button',
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const cls = usePartClass('button', 'tei-button', className);
  const iconOnly = icon !== undefined && children == null;
  const keys = shortcutText(shortcut);
  const named = label ?? (typeof rest.title === 'string' ? rest.title : undefined);
  // A tooltip that only repeats the visible text is noise.
  const tip = named !== undefined && !keys && children === named ? undefined : named;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cls}
      data-tei-part="button"
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly ? '' : undefined}
      aria-label={iconOnly ? label : rest['aria-label']}
      aria-pressed={pressed}
      aria-keyshortcuts={rest['aria-keyshortcuts']}
      title={undefined}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        // Keep focus (and the selection) in the editor on mouse and pen presses.
        if (event.pointerType !== 'touch' && event.button === 0) event.preventDefault();
        if (tip) hideTooltip(event.currentTarget);
        onPointerDown?.(event);
      }}
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        if (tip && event.pointerType !== 'touch') showTooltip(event.currentTarget, tip, keys);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event: PointerEvent<HTMLButtonElement>) => {
        if (tip) hideTooltip(event.currentTarget);
        onPointerLeave?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLButtonElement>) => {
        if (tip && event.currentTarget.matches(':focus-visible'))
          showTooltip(event.currentTarget, tip, keys);
        onFocus?.(event);
      }}
      onBlur={(event: FocusEvent<HTMLButtonElement>) => {
        if (tip) hideTooltip(event.currentTarget);
        onBlur?.(event);
      }}
    >
      {icon !== undefined && <Icon icon={icon} />}
      {children}
      {chevron && <Icon icon={CHEVRON} className="tei-chevron" />}
    </button>
  );
});

const CHEVRON = [['path', { d: 'm6 9 6 6 6-6' }]] as const;
