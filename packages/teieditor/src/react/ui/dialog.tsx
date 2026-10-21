'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from './button.js';
import { usePartClass } from './context.js';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons along the bottom. */
  footer?: ReactNode;
  /** Close label for the × button; omit to leave the button out. */
  closeLabel?: string;
  /** Form submission inside the dialog (Enter in an input) calls this. */
  onSubmit?: () => void;
  className?: string;
  children?: ReactNode;
}

/**
 * A modal dialog on the native `<dialog>`: the browser traps focus, makes
 * the page inert, and closes it on Escape. On narrow screens it docks to
 * the bottom as a sheet.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  closeLabel = 'Close',
  onSubmit,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const cls = usePartClass('dialog', 'tei-dialog tei-portal', className);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard way out is Escape, which the browser handles
    <dialog
      ref={ref}
      className={cls}
      data-tei-part="dialog"
      data-tei-ui=""
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClose={() => onOpenChange(false)}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          if (!onSubmit) return;
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="tei-dialog-header">
          <h2 id={`${id}-title`} className="tei-dialog-title">
            {title}
          </h2>
          {closeLabel && (
            <Button icon={CLOSE} label={closeLabel} size="sm" onClick={() => onOpenChange(false)} />
          )}
        </div>
        <div className="tei-dialog-body">
          {description != null && (
            <p id={`${id}-description`} className="tei-hint">
              {description}
            </p>
          )}
          {open && children}
        </div>
        {footer != null && <div className="tei-dialog-footer">{footer}</div>}
      </form>
    </dialog>
  );
}

const CLOSE = [['path', { d: 'M18 6 6 18M6 6l12 12' }]] as const;
