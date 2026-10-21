'use client';

import { type ComponentType, createContext, type ReactNode, useContext } from 'react';
import type { TeiIconNode } from '../../core/types.js';

/** Anything that can stand in for an icon: data, an element, or a component. */
export type TeiIconLike = TeiIconNode | ReactNode | ComponentType<{ className?: string }>;

/**
 * Presentation settings for every teieditor component below the provider:
 * the layer between the editor's own registries and the app's design.
 */
export interface TeiUIConfig {
  /** Replace icons by name, over the extensions' icons and the editor's `icons` option. */
  icons?: Readonly<Record<string, TeiIconLike>>;
  /** Extra classes by part name (`button`, `toolbar`, `menuItem`, …), added to the built-in ones. */
  classNames?: Readonly<Partial<Record<TeiPart, string>>>;
  /** Drop every built-in `tei-*` class, keeping only `classNames` and the `data-tei-*` hooks. */
  unstyled?: boolean;
}

/** The parts `classNames` can target. Each also carries a `data-tei-part` attribute. */
export type TeiPart =
  | 'button'
  | 'toolbar'
  | 'separator'
  | 'popover'
  | 'menu'
  | 'menuGroup'
  | 'menuLabel'
  | 'menuItem'
  | 'tooltip'
  | 'dialog'
  | 'input'
  | 'select'
  | 'switch'
  | 'stepper'
  | 'swatches'
  | 'swatch'
  | 'gridPicker'
  | 'icon';

export const TeiUIContext = createContext<TeiUIConfig>({});

export function useTeiUI(): TeiUIConfig {
  return useContext(TeiUIContext);
}

/** Join class names, skipping falsy ones. */
export function cx(...classes: Array<string | false | null | undefined>): string | undefined {
  let out = '';
  for (const c of classes) if (c) out = out ? `${out} ${c}` : c;
  return out || undefined;
}

/**
 * The class list for a part: the built-in class (unless unstyled), the
 * app's class for that part, and the component's own `className`.
 */
export function usePartClass(
  part: TeiPart,
  builtIn: string,
  className?: string,
): string | undefined {
  const { classNames, unstyled } = useTeiUI();
  return cx(!unstyled && builtIn, classNames?.[part], className);
}
