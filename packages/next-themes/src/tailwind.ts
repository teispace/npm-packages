/**
 * Tailwind v3 helpers. For Tailwind v4, import the CSS preset directly:
 *
 *   @import "@teispace/next-themes/tailwind.css";
 *
 * For Tailwind v3 JS config:
 *
 *   import { darkMode } from '@teispace/next-themes/tailwind';
 *   export default { darkMode, ... };
 */

/**
 * Tailwind v3 `darkMode` configuration that matches both `data-theme="dark"`
 * and `.dark` class on any ancestor — mirrors the v4 preset.
 */
export const darkMode: ['variant', string[]] = [
  'variant',
  ['&:where([data-theme="dark"], [data-theme="dark"] *)', '&:where(.dark, .dark *)'],
];

/**
 * A named custom-variant selector for an arbitrary theme. Use in v3 config to
 * add variants like `sepia:bg-amber-100`.
 *
 * @example
 *   const tw = {
 *     theme: {...},
 *     plugins: [
 *       plugin(({ addVariant }) => {
 *         addVariant('sepia', themeVariant('sepia'));
 *       })
 *     ]
 *   };
 */
export function themeVariant(name: string): string[] {
  return [
    `&:where([data-theme="${name}"], [data-theme="${name}"] *)`,
    `&:where(.${name}, .${name} *)`,
  ];
}

const preset = {
  darkMode,
};

export default preset;
