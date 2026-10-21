'use client';

import { type ReactNode, useState } from 'react';
import { Button, type ButtonProps } from './button.js';
import type { Placement } from './floating.js';
import { Menu, type MenuGroupData, type MenuItemData } from './menu.js';
import { Popover } from './popover.js';

export interface DropdownMenuProps extends Omit<ButtonProps, 'onSelect' | 'content'> {
  items?: readonly MenuItemData[];
  groups?: readonly MenuGroupData[];
  placement?: Placement;
  /** Instead of a menu, any content (a colour picker, a form). It gets `close`. */
  content?: (close: () => void) => ReactNode;
  /** Accessible name of the menu; defaults to the button's label. */
  menuLabel?: string;
  /** Called when it opens or closes. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A button that opens a menu (or any content) below it. ArrowDown, Enter
 * and Space open it with the first item highlighted; Escape closes it and
 * returns focus to the button.
 */
export function DropdownMenu({
  items,
  groups,
  placement = 'bottom-start',
  content,
  menuLabel,
  onOpenChange,
  chevron = true,
  onClick,
  onKeyDown,
  ...button
}: DropdownMenuProps) {
  const [open, setOpenState] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <>
      <Button
        {...button}
        ref={setAnchor}
        chevron={chevron}
        aria-haspopup={content ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={(event) => {
          setOpen(!open);
          onClick?.(event);
        }}
        onKeyDown={(event) => {
          if (!open && event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
          onKeyDown?.(event);
        }}
      />
      <Popover
        open={open}
        anchor={anchor}
        placement={placement}
        initialFocus={content ? 'first' : 'none'}
        restoreFocus={false}
        onDismiss={(reason) => {
          setOpen(false);
          if (reason === 'escape') anchor?.focus({ preventScroll: true });
        }}
      >
        {content ? (
          content(() => setOpen(false))
        ) : (
          <Menu
            items={items}
            groups={groups}
            label={menuLabel ?? button.label}
            onClose={(reason) => {
              setOpen(false);
              if (reason === 'escape') anchor?.focus({ preventScroll: true });
            }}
          />
        )}
      </Popover>
    </>
  );
}
