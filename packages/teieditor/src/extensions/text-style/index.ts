import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  getStyleObjectFromCSS,
} from '@lexical/selection';
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  configExtension,
  type LexicalNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiItem } from '../../core/types.js';
import { backgroundColor, fontFamily, fontSize, textColor } from '../../icons/index.js';
import { $canStyleText } from '../../utils/selection.js';
import { isSafeStyleValue } from '../../utils/style-values.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** A font stack for the selected text; `null` back to the default. */
    setFontFamily: [family: string | null];
    /** A size in pixels (or any CSS length) for the selected text; `null` back to the default. */
    setFontSize: [size: number | string | null];
    /** One step up or down the size scale. */
    increaseFontSize: [];
    decreaseFontSize: [];
    setColor: [color: string | null];
    setBackgroundColor: [color: string | null];
    /** Every text style off the selection: family, size, colours. */
    unsetTextStyle: [];
  }
  interface TeiActiveStates {
    fontFamily: [family: string];
    fontSize: [size: number | string];
    color: [color: string];
    backgroundColor: [color: string];
  }
}

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

export { isSafeStyleValue };

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

function $patch(property: TextStyleProperty, value: string | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  $patchStyleText(selection, { [property]: value });
  return true;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The next size on the scale, up or down, from where the selection is. */
export function nextFontSize(current: number, scale: readonly number[], direction: 1 | -1): number {
  const sorted = [...scale].sort((a, b) => a - b);
  if (direction > 0) return sorted.find((s) => s > current) ?? current + 1;
  return [...sorted].reverse().find((s) => s < current) ?? current - 1;
}

/** Keep only the text styles this extension knows, with safe values. */
function filterStyle(css: string): string {
  const style = getStyleObjectFromCSS(css);
  return TEXT_STYLE_PROPERTIES.flatMap((name) => {
    const value = style[name];
    return value && isSafeStyleValue(name, value) ? [`${name}: ${value.trim()};`] : [];
  }).join(' ');
}

/** Put an imported style under the text's own (an inner span's style wins). */
function $styleUnder(node: LexicalNode, css: string): void {
  if ($isTextNode(node)) {
    const merged = { ...getStyleObjectFromCSS(css), ...getStyleObjectFromCSS(node.getStyle()) };
    node.setStyle(
      Object.entries(merged)
        .map(([name, value]) => `${name}: ${value};`)
        .join(' '),
    );
  } else if ($isElementNode(node) && node.isInline()) {
    for (const child of node.getChildren()) $styleUnder(child, css);
  }
}

/**
 * Lexical's import reads bold, italic and the like from an element's
 * style, but drops colours and fonts. This rule lets that import run, then
 * puts the text styles this extension knows on what it made, so saved HTML
 * and pastes keep them.
 */
const TextStyleImport = defineImportRule({
  name: '@teispace/teieditor/text-style',
  match: sel
    .tag('span', 'b', 'strong', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup', 'a', 'font')
    .attr('style', true),
  $import: (_ctx, el, $next) => {
    const nodes = $next();
    const css = filterStyle(el.getAttribute('style') ?? '');
    if (css) for (const node of nodes) $styleUnder(node, css);
    return nodes;
  },
});

const DEFAULT_FAMILIES: TextStyleOptions['fontFamilies'] = [
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['"Courier New", Courier, monospace', 'Courier New'],
  ['Georgia, serif', 'Georgia'],
  ['"Times New Roman", Times, serif', 'Times New Roman'],
  ['"Trebuchet MS", sans-serif', 'Trebuchet MS'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
];

/** Readable on light and dark backgrounds alike. */
const DEFAULT_COLORS: readonly TextColor[] = [
  { value: '#6b7280', label: 'Gray' },
  { value: '#b45309', label: 'Brown' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#ca8a04', label: 'Yellow' },
  { value: '#16a34a', label: 'Green' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#9333ea', label: 'Purple' },
  { value: '#db2777', label: 'Pink' },
  { value: '#dc2626', label: 'Red' },
];

/** Translucent, so text stays legible over them in light and dark mode. */
const DEFAULT_BACKGROUNDS: readonly TextColor[] = [
  { value: 'rgb(107 114 128 / 0.25)', label: 'Gray' },
  { value: 'rgb(180 83 9 / 0.25)', label: 'Brown' },
  { value: 'rgb(234 88 12 / 0.25)', label: 'Orange' },
  { value: 'rgb(234 179 8 / 0.35)', label: 'Yellow' },
  { value: 'rgb(22 163 74 / 0.25)', label: 'Green' },
  { value: 'rgb(37 99 235 / 0.25)', label: 'Blue' },
  { value: 'rgb(147 51 234 / 0.25)', label: 'Purple' },
  { value: 'rgb(219 39 119 / 0.25)', label: 'Pink' },
  { value: 'rgb(220 38 38 / 0.25)', label: 'Red' },
];

const sameValue = (a: string, b: string) =>
  a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

const sizeValue = (size: number | string) => (typeof size === 'number' ? `${size}px` : size);

/**
 * Font family, font size, text colour and highlight colour for any run of
 * text, as inline styles. Values are checked before they are written or
 * read from HTML, so a paste can't bring in `url()` or other properties.
 * In the toolbar: a font menu, a size stepper and two colour pickers.
 */
export const TextStyle = defineTeiExtension({
  name: '@teispace/teieditor/text-style',
  config: {
    fontFamilies: DEFAULT_FAMILIES,
    fontSizes: [8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96],
    defaultFontSize: 16,
    minFontSize: 8,
    maxFontSize: 96,
    colors: DEFAULT_COLORS,
    backgroundColors: DEFAULT_BACKGROUNDS,
    customColors: true,
  } as TextStyleOptions,
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [TextStyleImport] })],
  commands: {
    setFontFamily: {
      run: (_ctx, family: string | null) =>
        family === null || isSafeStyleValue('font-family', family)
          ? $patch('font-family', family)
          : false,
      can: $canStyleText,
    },
    setFontSize: {
      run: ({ options }, size: number | string | null) => {
        if (size === null) return $patch('font-size', null);
        const value =
          typeof size === 'number'
            ? `${clamp(Math.round(size), options.minFontSize, options.maxFontSize)}px`
            : size;
        return isSafeStyleValue('font-size', value) && $patch('font-size', value);
      },
      can: $canStyleText,
    },
    increaseFontSize: {
      run: ({ options }) => {
        const next = nextFontSize($getFontSize(options.defaultFontSize), options.fontSizes, 1);
        return $patch('font-size', `${clamp(next, options.minFontSize, options.maxFontSize)}px`);
      },
      can: ({ options }) =>
        $canStyleText() && $getFontSize(options.defaultFontSize) < options.maxFontSize,
    },
    decreaseFontSize: {
      run: ({ options }) => {
        const next = nextFontSize($getFontSize(options.defaultFontSize), options.fontSizes, -1);
        return $patch('font-size', `${clamp(next, options.minFontSize, options.maxFontSize)}px`);
      },
      can: ({ options }) =>
        $canStyleText() && $getFontSize(options.defaultFontSize) > options.minFontSize,
    },
    setColor: {
      run: (_ctx, color: string | null) =>
        color === null || isSafeStyleValue('color', color) ? $patch('color', color) : false,
      can: $canStyleText,
    },
    setBackgroundColor: {
      run: (_ctx, color: string | null) =>
        color === null || isSafeStyleValue('background-color', color)
          ? $patch('background-color', color)
          : false,
      can: $canStyleText,
    },
    unsetTextStyle: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        $patchStyleText(
          selection,
          Object.fromEntries(TEXT_STYLE_PROPERTIES.map((name) => [name, null])),
        );
      },
      can: $canStyleText,
    },
  },
  active: {
    fontFamily: (_ctx, family: string) => sameValue($getTextStyle('font-family'), family),
    fontSize: (_ctx, size: number | string) =>
      sameValue($getTextStyle('font-size'), sizeValue(size)),
    color: (_ctx, color: string) => sameValue($getTextStyle('color'), color),
    backgroundColor: (_ctx, color: string) => sameValue($getTextStyle('background-color'), color),
  },
  keymap: {
    increaseFontSize: {
      key: 'Mod-Shift-.',
      command: 'increaseFontSize',
      description: 'Bigger text',
    },
    decreaseFontSize: {
      key: 'Mod-Shift-,',
      command: 'decreaseFontSize',
      description: 'Smaller text',
    },
  },
  icons: { textColor, backgroundColor, fontFamily, fontSize },
  messages: {
    'style.fontFamily': 'Font',
    'style.fontFamily.default': 'Default font',
    'style.fontSize': 'Font size',
    'style.fontSize.increase': 'Bigger text',
    'style.fontSize.decrease': 'Smaller text',
    'style.color': 'Text colour',
    'style.backgroundColor': 'Highlight colour',
    'style.color.default': 'Default',
    'style.color.custom': 'Custom colour',
  },
  items: [
    {
      id: 'fontFamily',
      label: 'style.fontFamily',
      icon: 'fontFamily',
      in: ['toolbar'],
      group: 'style',
      order: 0,
      control: 'fontFamily',
      command: 'setFontFamily',
      args: [null],
    },
    {
      id: 'fontSize',
      label: 'style.fontSize',
      icon: 'fontSize',
      in: ['toolbar'],
      group: 'style',
      order: 10,
      control: 'fontSize',
      command: 'setFontSize',
      args: [null],
    },
    {
      id: 'color',
      label: 'style.color',
      icon: 'textColor',
      in: ['toolbar', 'bubble'],
      group: 'color',
      order: 0,
      control: 'color',
      command: 'setColor',
      args: [null],
    },
    {
      id: 'backgroundColor',
      label: 'style.backgroundColor',
      icon: 'backgroundColor',
      in: ['toolbar', 'bubble'],
      group: 'color',
      order: 10,
      control: 'backgroundColor',
      command: 'setBackgroundColor',
      args: [null],
    },
  ] satisfies TeiItem[],
});

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
