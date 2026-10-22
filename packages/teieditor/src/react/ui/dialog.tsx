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
const FIRST_FIELD =
  '.tei-dialog-body :is(input, select, textarea, [contenteditable="true"]):not(:disabled)';
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * The control last pressed. Our buttons keep focus where it was (in the
 * editor) and Safari never focuses a clicked button, so "the focused
 * element" is often <body> when a dialog opens; this is what opened it.
 */
let lastPressed: Element | null = null;
let tracking = false;
function trackPresses(doc: Document) {
  if (tracking) return;
  tracking = true;
  doc.addEventListener(
    'pointerdown',
    (event) => {
      lastPressed = event.target instanceof Element ? event.target : null;
    },
    { capture: true, passive: true },
  );
}

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

  const invoker = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog) trackPresses(dialog.ownerDocument);
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const doc = dialog.ownerDocument;
      const active = doc.activeElement;
      invoker.current =
        active && active !== doc.body
          ? (active as HTMLElement)
          : (lastPressed?.closest<HTMLElement>('button, a[href], [role="button"], [tabindex]') ??
            null);
      // The browser focuses the first focusable element, which is the close
      // button; typing belongs in the first field. Marking it autofocus lets
      // every engine's own dialog focusing pick it.
      const field = dialog.querySelector<HTMLElement>('[autofocus]')
        ? null
        : dialog.querySelector<HTMLElement>(FIRST_FIELD);
      field?.setAttribute('autofocus', '');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      field?.removeAttribute('autofocus');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      // Back to what opened it, unless the browser already put focus somewhere real.
      const doc = dialog.ownerDocument;
      const target = invoker.current;
      invoker.current = null;
      if (
        target?.isConnected &&
        (doc.activeElement === doc.body || dialog.contains(doc.activeElement))
      ) {
        target.focus({ preventScroll: true });
      }
    }
  }, [open]);

  return (
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
      onKeyDown={(event) => {
        // Tab cycles through the dialog's controls. Left to the browser,
        // focus leaves a modal dialog for the browser's own UI, and Safari
        // skips buttons altogether unless Full Keyboard Access is on.
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.getClientRects().length > 0);
        if (focusable.length === 0) return;
        const active = event.currentTarget.ownerDocument.activeElement as HTMLElement | null;
        const index = active ? focusable.indexOf(active) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next = focusable[(index + step + focusable.length) % focusable.length];
        event.preventDefault();
        next?.focus();
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
          <div className="tei-dialog-heading">
            <h2 id={`${id}-title`} className="tei-dialog-title">
              {title}
            </h2>
            {description != null && (
              <p id={`${id}-description`} className="tei-dialog-description">
                {description}
              </p>
            )}
          </div>
          {closeLabel && (
            <Button icon={CLOSE} label={closeLabel} size="sm" onClick={() => onOpenChange(false)} />
          )}
        </div>
        <div className="tei-dialog-body">{open && children}</div>
        {footer != null && <div className="tei-dialog-footer">{footer}</div>}
      </form>
    </dialog>
  );
}

const CLOSE = [['path', { d: 'M18 6 6 18M6 6l12 12' }]] as const;
