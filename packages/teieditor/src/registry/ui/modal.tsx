'use client';

import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  /** Modal title. */
  title: string;
  /** Modal content. */
  children: ReactNode;
  /** Called when modal should close. */
  onClose: () => void;
  /** Additional class for the modal panel. */
  className?: string;
}

/**
 * Portal-based modal with overlay, focus trap, and escape key.
 */
export function Modal({ title, children, onClose, className = '' }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Focus trap: focus modal on mount
  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      className="tei-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'tei-modal w-full max-w-md rounded-xl border border-[hsl(var(--tei-border))]',
          'bg-[hsl(var(--tei-bg))] p-6 shadow-2xl',
          'animate-in fade-in-0 zoom-in-95',
          className,
        ].join(' ')}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[hsl(var(--tei-fg))]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-fg))]"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
