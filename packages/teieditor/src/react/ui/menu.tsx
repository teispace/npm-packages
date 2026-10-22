'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type TeiIconLike, usePartClass } from './context.js';
import { Icon } from './icon.js';
import { keepFocus } from './pointer.js';
import { type DismissReason, Popover } from './popover.js';

export interface MenuItemData {
  id: string;
  label: ReactNode;
  /** Plain text for typeahead and screen readers, when `label` is not a string. */
  textValue?: string;
  description?: ReactNode;
  icon?: string | TeiIconLike;
  /** Show the icon in a large tile (slash-menu style). */
  tile?: boolean;
  /** Key hint, already formatted. */
  shortcut?: readonly string[] | string;
  /** A checkable item: `true`/`false` makes it a checkbox item. */
  checked?: boolean;
  /** With `checked`: one choice of several (a font, a colour), a radio item. */
  radio?: boolean;
  disabled?: boolean;
  variant?: 'danger';
  /** A submenu. */
  items?: readonly MenuItemData[];
  /** A submenu in sections (instead of `items`). */
  groups?: readonly MenuGroupData[];
  onSelect?: () => void;
}

export interface MenuGroupData {
  id: string;
  label?: ReactNode;
  items: readonly MenuItemData[];
}

// -- Navigation ---------------------------------------------------------------

export interface MenuNavigationOptions {
  count: number;
  isDisabled?: (index: number) => boolean;
  /** Text for typeahead; omit to turn typeahead off. */
  getText?: (index: number) => string;
  onSelect?: (index: number) => void;
  /** Called for ArrowRight on an item (open its submenu) and ArrowLeft (go back). */
  onOpenSub?: (index: number) => boolean;
  onBack?: () => boolean;
  /** Wrap from the last item to the first. Default true. */
  loop?: boolean;
  /** Start with nothing highlighted (`-1`) instead of the first item. */
  initial?: number;
}

export interface MenuNavigation {
  highlighted: number;
  setHighlighted: (index: number) => void;
  /** Handle a key; `true` if it was used (the caller then prevents the default). */
  handleKey: (event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>) => boolean;
}

/**
 * Keyboard navigation for a list: arrows, Home/End, Enter, typeahead.
 * Separate from {@link Menu} so a list driven from elsewhere (the slash
 * menu, where focus stays in the document) gets the same behaviour.
 */
export function useMenuNavigation({
  count,
  isDisabled = () => false,
  getText,
  onSelect,
  onOpenSub,
  onBack,
  loop = true,
  initial = 0,
}: MenuNavigationOptions): MenuNavigation {
  const firstEnabled = useCallback(
    (from: number, step: 1 | -1): number => {
      for (let i = 0, index = from; i < count; i++, index += step) {
        if (index < 0 || index >= count) {
          if (!loop) return -1;
          index = (index + count) % count;
        }
        if (!isDisabled(index)) return index;
      }
      return -1;
    },
    [count, isDisabled, loop],
  );

  const [highlighted, setHighlighted] = useState(() =>
    initial < 0 ? -1 : firstEnabled(initial, 1),
  );
  // Keep the highlight valid as the list changes (filtering a slash menu).
  const current =
    highlighted >= count || (highlighted >= 0 && isDisabled(highlighted))
      ? firstEnabled(0, 1)
      : highlighted;

  const typed = useRef({ text: '', at: 0 });

  const handleKey: MenuNavigation['handleKey'] = (event) => {
    const move = (index: number) => {
      if (index >= 0) setHighlighted(index);
      return true;
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(current < 0 ? firstEnabled(0, 1) : firstEnabled(current + 1, 1));
      case 'ArrowUp':
        return move(current < 0 ? firstEnabled(count - 1, -1) : firstEnabled(current - 1, -1));
      case 'Home':
        return move(firstEnabled(0, 1));
      case 'End':
        return move(firstEnabled(count - 1, -1));
      case 'Enter':
      case ' ':
        // Space mid-typeahead is part of the query, not a selection.
        if (event.key === ' ' && getText && Date.now() - typed.current.at < 600) return false;
        if (current < 0) return false;
        onSelect?.(current);
        return true;
      case 'ArrowRight':
        return current >= 0 && (onOpenSub?.(current) ?? false);
      case 'ArrowLeft':
        return onBack?.() ?? false;
    }
    if (getText && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      typed.current.text = (now - typed.current.at > 600 ? '' : typed.current.text) + event.key;
      typed.current.at = now;
      const query = typed.current.text.toLowerCase();
      // A repeated first letter cycles; a longer query refines from the current item.
      const from = query.length > 1 ? Math.max(current, 0) : current + 1;
      for (let i = 0; i < count; i++) {
        const index = (((from + i) % count) + count) % count;
        if (!isDisabled(index) && getText(index).toLowerCase().startsWith(query)) {
          setHighlighted(index);
          break;
        }
      }
      return true;
    }
    return false;
  };

  return { highlighted: current, setHighlighted, handleKey };
}

// -- Menu ---------------------------------------------------------------------

export interface MenuProps {
  /** Items, or groups of items with optional labels. */
  items?: readonly MenuItemData[];
  groups?: readonly MenuGroupData[];
  /** Accessible name of the menu. */
  label?: string;
  /** Called after an item's own `onSelect`. */
  onSelect?: (item: MenuItemData) => void;
  /** Asked to close: after a selection, on Escape, or ArrowLeft in a submenu. */
  onClose?: (reason: DismissReason | 'back') => void;
  /** Focus the menu on mount so arrows work at once. Default true. */
  autoFocus?: boolean;
  /** The row highlighted first: `'checked'` for the checked one (a choice of kinds). Default the first. */
  initial?: number | 'checked';
  /** Drive the highlight from outside (the slash menu). */
  navigation?: MenuNavigation;
  /** Shown when there are no items. */
  empty?: ReactNode;
  /** Replace how an item is drawn; the row element and its behaviour stay. */
  renderItem?: (item: MenuItemData, state: { highlighted: boolean }) => ReactNode;
  className?: string;
  id?: string;
}

/** Whether an item opens a submenu. */
const hasSubmenu = (item: MenuItemData | undefined): boolean =>
  Boolean(item?.items?.length || item?.groups?.some((group) => group.items.length > 0));

function textOf(item: MenuItemData): string {
  return item.textValue ?? (typeof item.label === 'string' ? item.label : '');
}

/**
 * A menu (WAI-ARIA menu pattern): arrow keys, Home/End, typeahead, Enter,
 * submenus on ArrowRight or hover, Escape to close. Focus stays on the
 * menu and the highlighted row is announced through `aria-activedescendant`,
 * so scrolling and highlighting never fight over focus.
 */
export function Menu({
  items,
  groups,
  label,
  onSelect,
  onClose,
  autoFocus = true,
  initial,
  navigation,
  empty,
  renderItem,
  className,
  id,
}: MenuProps) {
  const autoId = useId();
  const menuId = id ?? `tei-menu${autoId.replace(/:/g, '')}`;
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLElement | null>>([]);
  const [openSub, setOpenSub] = useState<number>(-1);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sections: readonly MenuGroupData[] = useMemo(
    () => groups ?? (items ? [{ id: 'items', items }] : []),
    [groups, items],
  );
  const flat = useMemo(() => sections.flatMap((group) => group.items), [sections]);

  const select = (index: number) => {
    const item = flat[index];
    if (!item || item.disabled) return;
    if (hasSubmenu(item)) {
      setOpenSub(index);
      return;
    }
    item.onSelect?.();
    onSelect?.(item);
    onClose?.('select');
  };

  const own = useMenuNavigation({
    count: flat.length,
    isDisabled: (index) => Boolean(flat[index]?.disabled),
    getText: (index) => textOf(flat[index] as MenuItemData),
    initial:
      initial === 'checked'
        ? Math.max(
            0,
            flat.findIndex((item) => item.checked),
          )
        : initial,
    onSelect: select,
    onOpenSub: (index) => {
      if (!hasSubmenu(flat[index])) return false;
      setOpenSub(index);
      return true;
    },
    onBack: () => {
      if (!onClose) return false;
      onClose('back');
      return true;
    },
  });
  const nav = navigation ?? own;
  const { highlighted } = nav;

  useEffect(() => {
    if (autoFocus && !navigation) listRef.current?.focus({ preventScroll: true });
  }, [autoFocus, navigation]);

  useEffect(() => {
    rowRefs.current[highlighted]?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const menuCls = usePartClass('menu', 'tei-menu', className);
  const groupCls = usePartClass('menuGroup', 'tei-menu-group');
  const labelCls = usePartClass('menuLabel', 'tei-menu-label');
  const itemCls = usePartClass('menuItem', 'tei-menu-item');
  const rowId = (index: number) => `${menuId}-${index}`;

  let index = -1;
  return (
    <div
      ref={listRef}
      id={menuId}
      role="menu"
      aria-label={label}
      aria-activedescendant={highlighted >= 0 && !navigation ? rowId(highlighted) : undefined}
      tabIndex={navigation ? undefined : -1}
      className={menuCls}
      data-tei-part="menu"
      onKeyDown={(event: ReactKeyboardEvent) => {
        if (openSub >= 0) return;
        if (nav.handleKey(event)) {
          event.preventDefault();
          event.stopPropagation();
        } else if (event.key === 'Tab') {
          onClose?.('escape');
        }
      }}
    >
      {flat.length === 0 && empty != null && <div className="tei-menu-empty">{empty}</div>}
      {sections.map((group) =>
        group.items.length === 0 ? null : (
          <div
            key={group.id}
            role="group"
            aria-label={typeof group.label === 'string' ? group.label : undefined}
            className={groupCls}
            data-tei-part="menu-group"
          >
            {group.label != null && (
              <div className={labelCls} aria-hidden="true">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              index++;
              const i = index;
              const isHighlighted = i === highlighted;
              const hasSub = hasSubmenu(item);
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled once, on the menu, through aria-activedescendant
                <div
                  key={item.id}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  id={rowId(i)}
                  role={
                    item.checked === undefined
                      ? 'menuitem'
                      : item.radio
                        ? 'menuitemradio'
                        : 'menuitemcheckbox'
                  }
                  aria-checked={item.checked}
                  aria-disabled={item.disabled || undefined}
                  aria-haspopup={hasSub ? 'menu' : undefined}
                  aria-expanded={hasSub ? openSub === i : undefined}
                  className={itemCls}
                  data-tei-part="menu-item"
                  data-highlighted={isHighlighted ? '' : undefined}
                  data-variant={item.variant}
                  data-id={item.id}
                  onPointerMove={(event) => {
                    // A finger scrolling the menu does not light up each row it passes.
                    if (event.pointerType === 'touch') return;
                    if (item.disabled || isHighlighted) return;
                    nav.setHighlighted(i);
                    clearTimeout(hoverTimer.current);
                    hoverTimer.current = setTimeout(() => setOpenSub(hasSub ? i : -1), 120);
                  }}
                  onPointerDown={keepFocus}
                  onClick={() => select(i)}
                >
                  {renderItem ? (
                    renderItem(item, { highlighted: isHighlighted })
                  ) : (
                    <>
                      {item.icon !== undefined &&
                        (item.tile ? (
                          <span className="tei-menu-item-tile">
                            <Icon icon={item.icon} />
                          </span>
                        ) : (
                          <Icon icon={item.icon} />
                        ))}
                      <span className="tei-menu-item-text">
                        <span className="tei-menu-item-label">{item.label}</span>
                        {item.description != null && (
                          <span className="tei-menu-item-description">{item.description}</span>
                        )}
                      </span>
                      {item.shortcut && (
                        <kbd className="tei-kbd">
                          {typeof item.shortcut === 'string'
                            ? item.shortcut
                            : item.shortcut.join(item.shortcut.includes('⌘') ? '' : '+')}
                        </kbd>
                      )}
                      {item.checked && <Icon icon={CHECK} />}
                      {hasSub && <Icon icon={CHEVRON_RIGHT} flipRtl />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ),
      )}
      {openSub >= 0 && flat[openSub] && hasSubmenu(flat[openSub]) ? (
        <Popover
          open
          anchor={rowRefs.current[openSub]}
          placement="right-start"
          offset={4}
          onDismiss={(reason) => {
            setOpenSub(-1);
            if (reason === 'outside') onClose?.('outside');
            else listRef.current?.focus({ preventScroll: true });
          }}
        >
          <Menu
            items={flat[openSub].items}
            groups={flat[openSub].groups}
            label={textOf(flat[openSub])}
            onSelect={onSelect}
            onClose={(reason) => {
              setOpenSub(-1);
              if (reason === 'back') listRef.current?.focus({ preventScroll: true });
              else onClose?.(reason);
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

const CHECK = [['path', { d: 'M20 6 9 17l-5-5' }]] as const;
const CHEVRON_RIGHT = [['path', { d: 'm9 18 6-6-6-6' }]] as const;
