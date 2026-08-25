/**
 * `teiqr/terminal` — render a symbol as text.
 *
 * Genuinely useful, not a novelty: pairing a device over SSH, showing a TOTP
 * enrolment code from a CLI, or eyeballing a payload during development
 * without opening a file.
 *
 * The default uses half-block characters so one text row carries two module
 * rows. Terminal cells are roughly twice as tall as they are wide, so this is
 * what makes the output square — the naive "two spaces per module" approach
 * produces a code that is correct but twice as tall as it should be, and often
 * scrolls off the screen.
 */

import type { QrMatrix } from './core/types.js';

export interface TerminalOptions {
  /**
   * `'half'` packs two module rows per line with half-block characters —
   * compact and square. `'block'` uses two full-width characters per module,
   * which is larger but renders correctly in terminals with patchy Unicode
   * support. `'ascii'` falls back to `##` and spaces.
   */
  style?: 'half' | 'block' | 'ascii';
  /** Quiet zone in modules. Four is the specification minimum and the default. */
  quietZone?: number;
  /**
   * Invert light and dark. Needed on dark-background terminals: a scanner
   * expects dark modules on a light field, so on a dark theme the code must be
   * drawn with light modules to stay readable.
   */
  invert?: boolean;
}

const LIGHT = '█'; // full block
const UPPER = '▀'; // upper half block
const LOWER = '▄'; // lower half block

/**
 * Render a symbol as a string ready to `console.log`.
 *
 * @example
 * console.log(toTerminal(encode('https://example.com')));
 */
export const toTerminal = (matrix: QrMatrix, options: TerminalOptions = {}): string => {
  const { style = 'half', quietZone = 4, invert = false } = options;
  const quiet = Math.max(0, quietZone);
  const span = matrix.size + quiet * 2;

  /** True when the module at grid position (x, y) is dark. */
  const dark = (x: number, y: number): boolean => {
    const mx = x - quiet;
    const my = y - quiet;
    if (mx < 0 || my < 0 || mx >= matrix.size || my >= matrix.size) return false;
    return matrix.modules[my * matrix.size + mx] === 1;
  };

  // A scanner needs dark-on-light. On a light terminal the "ink" is the
  // foreground character, so `on` means dark; inverting swaps which of the two
  // gets drawn.
  const on = (x: number, y: number): boolean => (invert ? !dark(x, y) : dark(x, y));

  if (style === 'block' || style === 'ascii') {
    const filled = style === 'block' ? LIGHT + LIGHT : '##';
    const empty = '  ';
    const rows: string[] = [];
    for (let y = 0; y < span; y++) {
      let row = '';
      for (let x = 0; x < span; x++) row += on(x, y) ? filled : empty;
      rows.push(row);
    }
    return rows.join('\n');
  }

  // Half-block: each output row covers module rows y and y+1.
  const rows: string[] = [];
  for (let y = 0; y < span; y += 2) {
    let row = '';
    for (let x = 0; x < span; x++) {
      const top = on(x, y);
      // An odd module count leaves the final row without a partner; treat the
      // missing row as light so the code is not padded with a dark band.
      const bottom = y + 1 < span ? on(x, y + 1) : false;
      if (top && bottom) row += LIGHT;
      else if (top) row += UPPER;
      else if (bottom) row += LOWER;
      else row += ' ';
    }
    rows.push(row);
  }
  return rows.join('\n');
};
