'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';

export interface TeiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. */
  variant?: 'default' | 'ghost' | 'outline';
  /** Size preset. */
  size?: 'default' | 'sm' | 'icon';
  /** Whether the button is in active/pressed state. */
  active?: boolean;
}

const variantStyles = {
  default: 'bg-[hsl(var(--tei-primary))] text-[hsl(var(--tei-primary-fg))] hover:opacity-90',
  ghost: 'hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-accent-fg))]',
  outline:
    'border border-[hsl(var(--tei-border))] bg-transparent hover:bg-[hsl(var(--tei-accent))]',
};

const sizeStyles = {
  default: 'h-9 px-3 text-sm',
  sm: 'h-7 px-2 text-xs',
  icon: 'h-8 w-8',
};

/**
 * Base button primitive for toolbar and UI components.
 * Supports active state, variants, and sizes.
 */
export const TeiButton = forwardRef<HTMLButtonElement, TeiButtonProps>(
  (
    { className = '', variant = 'ghost', size = 'icon', active, disabled, children, ...props },
    ref,
  ) => {
    // If a title is provided without an explicit aria-label, mirror it so
    // screen readers have a name for icon-only buttons.
    const ariaLabel =
      props['aria-label'] ?? (typeof props.title === 'string' ? props.title : undefined);

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-pressed={active}
        aria-label={ariaLabel}
        className={[
          'tei-btn inline-flex items-center justify-center rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tei-ring))]',
          'disabled:pointer-events-none disabled:opacity-40',
          variantStyles[variant],
          sizeStyles[size],
          active ? 'bg-[hsl(var(--tei-accent))] text-[hsl(var(--tei-accent-fg))]' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </button>
    );
  },
);

TeiButton.displayName = 'TeiButton';
