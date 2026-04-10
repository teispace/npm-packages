'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DropdownContextValue {
  registerItem: (ref: HTMLButtonElement) => void;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

// ---------------------------------------------------------------------------
// DropdownItem
// ---------------------------------------------------------------------------

export interface DropdownItemProps {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}

export function DropdownItem({
  children,
  onClick,
  active,
  disabled,
  className = '',
  icon,
}: DropdownItemProps) {
  const ctx = useContext(DropdownContext);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && ctx) ctx.registerItem(el);
  }, [ctx]);

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick();
        ctx?.close();
      }}
      className={[
        'tei-dropdown-item flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        'text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]',
        'focus:bg-[hsl(var(--tei-accent))] focus:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        active ? 'bg-[hsl(var(--tei-accent))]' : '',
        className,
      ].join(' ')}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="flex-1 truncate text-left">{children}</span>
      {active && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// DropdownGroup
// ---------------------------------------------------------------------------

export function DropdownGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="tei-dropdown-group" role="group" aria-label={label}>
      {label && (
        <div className="px-2.5 py-1 text-xs font-medium text-[hsl(var(--tei-muted-fg))]">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown
// ---------------------------------------------------------------------------

export interface DropdownProps {
  /** The trigger button content. */
  trigger: ReactNode;
  /** Dropdown content (DropdownItem / DropdownGroup). */
  children: ReactNode;
  /** Additional class for the trigger button. */
  triggerClassName?: string;
  /** Additional class for the dropdown panel. */
  className?: string;
  /** Whether the trigger is disabled. */
  disabled?: boolean;
  /** Alignment relative to trigger. */
  align?: 'start' | 'end';
}

export function Dropdown({
  trigger,
  children,
  triggerClassName = '',
  className = '',
  disabled,
  align = 'start',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLButtonElement[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const registerItem = useCallback((el: HTMLButtonElement) => {
    if (!itemsRef.current.includes(el)) {
      itemsRef.current.push(el);
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) {
      itemsRef.current = [];
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = itemsRef.current;
      if (items.length === 0) return;

      const focused = document.activeElement as HTMLButtonElement;
      const currentIndex = items.indexOf(focused);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[next]?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prev]?.focus();
          break;
        }
        case 'Escape':
        case 'Tab':
          e.preventDefault();
          close();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  // Focus first item when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        itemsRef.current[0]?.focus();
      });
    }
  }, [open]);

  // Position calculation
  const getPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return { top: 0, left: 0 };
    return {
      top: rect.bottom + 4,
      left: align === 'end' ? rect.right : rect.left,
    };
  }, [align]);

  const pos = open ? getPosition() : { top: 0, left: 0 };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'tei-dropdown-trigger inline-flex items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors',
          'text-[hsl(var(--tei-fg))] hover:bg-[hsl(var(--tei-accent))]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tei-ring))]',
          'disabled:pointer-events-none disabled:opacity-40',
          triggerClassName,
        ].join(' ')}
      >
        {trigger}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-50"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open &&
        typeof window !== 'undefined' &&
        createPortal(
          <DropdownContext.Provider value={{ registerItem, close }}>
            <div
              ref={menuRef}
              role="menu"
              className={[
                'tei-dropdown fixed z-50 min-w-[160px] overflow-hidden rounded-lg',
                'border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg',
                'animate-in fade-in-0 zoom-in-95',
                className,
              ].join(' ')}
              style={{
                top: pos.top,
                left: pos.left,
                transform: align === 'end' ? 'translateX(-100%)' : undefined,
              }}
            >
              {children}
            </div>
          </DropdownContext.Provider>,
          document.body,
        )}
    </>
  );
}
