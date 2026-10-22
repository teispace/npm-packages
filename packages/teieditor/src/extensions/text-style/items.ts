import { $getSelectionStyleValueForProperty } from '@lexical/selection';
import { $getSelection, $isRangeSelection } from 'lexical';
import type { TeiItem } from '../../core/types.js';

/*
 * What UI for text styles needs without the extension itself: its options'
 * shape, reading the selection's style, and its menus as items. The
 * toolbar's font and colour controls import this, so an editor without
 * TextStyle doesn't carry it.
 */

/** A colour on offer: its CSS value and a name for screen readers. */
export interface TextColor {
  value: string;
  label: string;
}

export interface TextStyleOptions {
  /** Font stacks on offer, as [CSS value, label]. */
  fontFamilies: ReadonlyArray<readonly [string, string]>;
  /** The sizes the stepper moves through, in pixels. */
  fontSizes: readonly number[];
  /** What unstyled text measures, shown when no size is set. Default 16. */
  defaultFontSize: number;
  /** Bounds for a size typed in. Default 8 and 96. */
  minFontSize: number;
  maxFontSize: number;
  /** Text colours on offer. */
  colors: readonly TextColor[];
  /** Highlight (background) colours on offer. */
  backgroundColors: readonly TextColor[];
  /** Offer any colour through the system picker, besides the swatches. Default true. */
  customColors: boolean;
}

/** The CSS properties this extension writes, and the only ones it reads from HTML. */
export const TEXT_STYLE_PROPERTIES = [
  'font-family',
  'font-size',
  'color',
  'background-color',
] as const;

export type TextStyleProperty = (typeof TEXT_STYLE_PROPERTIES)[number];

/** The text style of the selection for one property: `''` when unset or mixed. */
export function $getTextStyle(property: TextStyleProperty): string {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return '';
  return $getSelectionStyleValueForProperty(selection, property, '');
}

/** The selection's font size in pixels, or `fallback` when unset, mixed or not in pixels. */
export function $getFontSize(fallback: number): number {
  const value = $getTextStyle('font-size');
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return px ? Number(px[1]) : fallback;
}

/** The next size on the scale, up or down, from where the selection is. */
export function nextFontSize(current: number, scale: readonly number[], direction: 1 | -1): number {
  const sorted = [...scale].sort((a, b) => a - b);
  if (direction > 0) return sorted.find((s) => s > current) ?? current + 1;
  return [...sorted].reverse().find((s) => s < current) ?? current - 1;
}

/** The font families on offer as items, for menus: one per family, plus the default. */
export function fontFamilyItems(options: TextStyleOptions): TeiItem[] {
  return [
    {
      id: 'fontFamily:default',
      label: 'style.fontFamily.default',
      in: [],
      command: 'setFontFamily',
      args: [null],
    },
    ...options.fontFamilies.map(
      ([value, label]): TeiItem => ({
        id: `fontFamily:${value}`,
        label,
        in: [],
        command: 'setFontFamily',
        args: [value],
        active: 'fontFamily',
        activeArgs: [value],
      }),
    ),
  ];
}

/** Colours as items, for menus. */
export function colorItems(
  kind: 'color' | 'backgroundColor',
  colors: readonly TextColor[],
): TeiItem[] {
  const command = kind === 'color' ? 'setColor' : 'setBackgroundColor';
  return [
    { id: `${kind}:default`, label: 'style.color.default', in: [], command, args: [null] },
    ...colors.map(
      (color): TeiItem => ({
        id: `${kind}:${color.value}`,
        label: color.label,
        in: [],
        command,
        args: [color.value],
        active: kind,
        activeArgs: [color.value],
      }),
    ),
  ];
}

/** Sizes as items, for menus. */
export function fontSizeItems(options: TextStyleOptions): TeiItem[] {
  return [
    {
      id: 'fontSize:increase',
      label: 'style.fontSize.increase',
      in: [],
      shortcut: 'increaseFontSize',
      command: 'increaseFontSize',
    },
    {
      id: 'fontSize:decrease',
      label: 'style.fontSize.decrease',
      in: [],
      shortcut: 'decreaseFontSize',
      command: 'decreaseFontSize',
    },
    ...options.fontSizes.map(
      (size): TeiItem => ({
        id: `fontSize:${size}`,
        label: String(size),
        in: [],
        command: 'setFontSize',
        args: [size],
        active: 'fontSize',
        activeArgs: [size],
      }),
    ),
  ];
}
