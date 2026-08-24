/**
 * Opt-in registry for the Shift-JIS table that Kanji mode needs.
 *
 * Kanji mode packs a double-byte Shift-JIS character into 13 bits, against 24
 * for the same character in UTF-8 byte mode — a 46% saving on Japanese text.
 * Doing it requires a Unicode to Shift-JIS table, which is ~13 kB gzipped and
 * useless to the overwhelming majority of users.
 *
 * So the core ships the hook, not the table. `import 'teiqr/kanji'` registers
 * it as a side effect, and the batteries-included `teiqr` entry does that for
 * you. Without a registration Kanji mode is simply never selected, and text
 * encodes as UTF-8 bytes — correct, just larger.
 */

/** Maps a Unicode code point to its Shift-JIS double-byte value, or undefined. */
export type ShiftJisEncoder = (codePoint: number) => number | undefined;

let encoder: ShiftJisEncoder | null = null;

/**
 * Install the Shift-JIS table. Called by `teiqr/kanji`; calling it again
 * replaces the previous table, which lets a consumer substitute a smaller
 * subset table when they only need part of the range.
 */
export const registerKanjiTable = (fn: ShiftJisEncoder): void => {
  encoder = fn;
};

/** The installed table, or `null` when Kanji mode is unavailable. */
export const getKanjiTable = (): ShiftJisEncoder | null => encoder;

/** Whether Kanji mode can currently be used. */
export const isKanjiAvailable = (): boolean => encoder !== null;

/**
 * Convert a Shift-JIS double-byte value to its 13-bit Kanji-mode payload.
 *
 * Two disjoint ranges are valid — 0x8140-0x9FFC and 0xE040-0xEBBF — and each
 * is rebased before the bytes are combined as `high * 0xC0 + low`. Anything
 * outside them has no Kanji-mode representation and returns undefined.
 */
export const shiftJisToKanjiBits = (sjis: number): number | undefined => {
  let value: number;
  if (sjis >= 0x8140 && sjis <= 0x9ffc) value = sjis - 0x8140;
  else if (sjis >= 0xe040 && sjis <= 0xebbf) value = sjis - 0xc140;
  else return undefined;
  return (value >>> 8) * 0xc0 + (value & 0xff);
};
