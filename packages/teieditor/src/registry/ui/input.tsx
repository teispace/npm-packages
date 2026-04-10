'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * Styled text input for modals, link editor, find & replace.
 */
export const TeiInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string }
>(({ className = '', label, ...props }, ref) => {
  return (
    <input
      ref={ref}
      aria-label={label}
      className={[
        'tei-input flex h-8 w-full rounded-md border border-[hsl(var(--tei-border))]',
        'bg-[hsl(var(--tei-bg))] px-3 text-sm text-[hsl(var(--tei-fg))]',
        'placeholder:text-[hsl(var(--tei-muted-fg))]',
        'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tei-ring))]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      ].join(' ')}
      {...props}
    />
  );
});

TeiInput.displayName = 'TeiInput';
