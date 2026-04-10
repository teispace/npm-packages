'use client';

/**
 * Vertical separator for toolbar groups.
 */
export function TeiSeparator({ className = '' }: { className?: string }) {
  return (
    <div
      className={`tei-separator mx-1 h-6 w-px bg-[hsl(var(--tei-border))] ${className}`.trim()}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
