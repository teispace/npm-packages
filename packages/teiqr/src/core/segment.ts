/**
 * Mode selection and bit packing.
 *
 * The encoding a symbol uses is not a single choice for the whole string.
 * Switching modes costs a 4-bit indicator plus a character-count field, so the
 * cheapest encoding of `https://example.com/order/1234567890` is byte mode for
 * the URL and numeric mode for the trailing digits — never one mode
 * throughout. Getting this right routinely saves a whole version.
 */

import { BitWriter } from './bits.js';
import { eciDesignator, eciWidth } from './eci.js';
import { getKanjiTable, shiftJisToKanjiBits } from './kanji-registry.js';
import type { BitArray, QrMode, QrSegment } from './types.js';

/**
 * The 45-character alphanumeric alphabet, §7.4.4 Table 5. Exported so the
 * decoder indexes the same table it was encoded against.
 */
export const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Reverse lookup, so alphanumeric encoding is O(1) per character. */
const ALPHANUMERIC_INDEX = new Map<string, number>(
  [...ALPHANUMERIC_CHARSET].map((c, i) => [c, i] as const),
);

const MODE_INDICATOR: Readonly<Record<QrMode, number>> = {
  numeric: 0x1,
  alphanumeric: 0x2,
  byte: 0x4,
  kanji: 0x8,
  eci: 0x7,
  structured: 0x3,
};

/**
 * Modes that are headers, not character encodings: they carry no
 * character-count field, so the writer emits the indicator and payload alone.
 */
const COUNTLESS: ReadonlySet<QrMode> = new Set<QrMode>(['eci', 'structured']);

/**
 * Whether a mode omits its character-count field.
 *
 * Written as a type predicate so the compiler narrows the remaining modes to
 * exactly the keys of {@link COUNT_BITS}, rather than requiring an index-time
 * cast that would go stale if a mode were ever added.
 */
export const isCountlessMode = (mode: QrMode): mode is 'eci' | 'structured' => COUNTLESS.has(mode);

/** Character-count field width per mode, by version band (1-9, 10-26, 27-40). */
const COUNT_BITS: Readonly<
  Record<Exclude<QrMode, 'eci' | 'structured'>, readonly [number, number, number]>
> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
  kanji: [8, 10, 12],
};

export const modeIndicator = (mode: QrMode): number => MODE_INDICATOR[mode];

/**
 * What a symbology charges for a segment header, and which modes it offers.
 *
 * QR, Micro QR and rMQR differ in only three numbers — how wide the mode
 * indicator is, what value it takes, and how wide the character count is — so
 * the optimiser, the bit writer and the decoder are all written against this
 * rather than against one symbology. Asking for a mode a symbol cannot carry
 * then returns `null` instead of silently producing a subtly wrong count
 * field, which is a class of bug that survives every round trip through its
 * own decoder.
 */
export interface SymbologyModel {
  /** Width of the mode indicator field. Zero for Micro QR M1, which is numeric-only. */
  readonly modeBits: number;
  /** Value of the mode indicator for a mode. */
  indicator(mode: QrMode): number;
  /** Character-count field width, or null when this symbology cannot carry the mode. */
  countBits(mode: QrMode): number | null;
}

/**
 * Width of the character-count field. Header modes carry no count, so it is
 * zero for them and the writer emits only the indicator and the payload.
 */
export const countBits = (mode: QrMode, version: number): number => {
  if (isCountlessMode(mode)) return 0;
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return COUNT_BITS[mode][band];
};

/** The header cost model for a full QR symbol at `version`. */
export const qrModel = (version: number): SymbologyModel => ({
  modeBits: 4,
  indicator: modeIndicator,
  // Header modes report 0 rather than null: they are available, they simply
  // carry no character count.
  countBits: (mode) => countBits(mode, version),
});

/**
 * Write segments as mode indicator, character count and payload, in order.
 *
 * Field order is the one thing all three symbologies agree on, so they share
 * this writer. Zero-width fields are no-ops, which is what lets Micro QR M1
 * (no mode indicator) and the ECI header (no character count) go through
 * unchanged.
 */
export const writeSegments = (
  w: BitWriter,
  segments: readonly QrSegment[],
  model: SymbologyModel,
): void => {
  for (const seg of segments) {
    const cb = model.countBits(seg.mode);
    if (cb === null) throw new RangeError(`This symbol cannot carry ${seg.mode} data`);
    w.pushBits(model.indicator(seg.mode), model.modeBits);
    w.pushBits(seg.charCount, cb);
    w.pushArray(seg.bits);
  }
};

export const isNumericChar = (c: string): boolean => c >= '0' && c <= '9';
export const isAlphanumericChar = (c: string): boolean => ALPHANUMERIC_INDEX.has(c);
export const isNumeric = (text: string): boolean => /^[0-9]*$/.test(text);
export const isAlphanumeric = (text: string): boolean => [...text].every(isAlphanumericChar);

// ---------------------------------------------------------------------------
// Explicit single-mode segments
// ---------------------------------------------------------------------------

/** Pack digits: three per 10 bits, two per 7, one per 4. */
export const makeNumericSegment = (digits: string): QrSegment => {
  const w = new BitWriter(Math.ceil(digits.length / 2));
  for (let i = 0; i < digits.length; i += 3) {
    const chunk = digits.slice(i, i + 3);
    w.pushBits(Number.parseInt(chunk, 10), chunk.length * 3 + 1);
  }
  return { mode: 'numeric', charCount: digits.length, bits: w.toBitArray() };
};

/** Pack the 45-character alphabet: pairs into 11 bits, a trailing odd char into 6. */
export const makeAlphanumericSegment = (text: string): QrSegment => {
  const w = new BitWriter(Math.ceil(text.length * 1.5));
  let i = 0;
  for (; i + 1 < text.length; i += 2) {
    const hi = ALPHANUMERIC_INDEX.get(text[i]);
    const lo = ALPHANUMERIC_INDEX.get(text[i + 1]);
    if (hi === undefined || lo === undefined) {
      throw new RangeError(`Not alphanumeric-encodable: ${JSON.stringify(text[i] + text[i + 1])}`);
    }
    w.pushBits(hi * 45 + lo, 11);
  }
  if (i < text.length) {
    const only = ALPHANUMERIC_INDEX.get(text[i]);
    if (only === undefined) {
      throw new RangeError(`Not alphanumeric-encodable: ${JSON.stringify(text[i])}`);
    }
    w.pushBits(only, 6);
  }
  return { mode: 'alphanumeric', charCount: text.length, bits: w.toBitArray() };
};

/** Pack raw bytes. `charCount` counts bytes, not characters. */
export const makeByteSegment = (bytes: Uint8Array): QrSegment => ({
  mode: 'byte',
  charCount: bytes.length,
  bits: { length: bytes.length * 8, bytes: Uint8Array.from(bytes) },
});

/**
 * Pack Shift-JIS double-byte characters at 13 bits each. Throws when a
 * character has no Shift-JIS representation, so callers must filter first —
 * {@link planSegments} only routes characters the table accepts.
 */
export const makeKanjiSegment = (text: string): QrSegment => {
  const table = getKanjiTable();
  if (!table) {
    throw new Error("Kanji mode needs a Shift-JIS table. Add `import 'teiqr/kanji'`.");
  }
  const chars = [...text];
  const w = new BitWriter(Math.ceil((chars.length * 13) / 8));
  for (const ch of chars) {
    const sjis = table(ch.codePointAt(0) as number);
    const bits = sjis === undefined ? undefined : shiftJisToKanjiBits(sjis);
    if (bits === undefined) {
      throw new RangeError(`Not Kanji-encodable: ${JSON.stringify(ch)}`);
    }
    w.pushBits(bits, 13);
  }
  return { mode: 'kanji', charCount: chars.length, bits: w.toBitArray() };
};

/** An ECI header declaring the charset of everything that follows. */
export const makeEciSegment = (assignment: number): QrSegment => {
  const w = new BitWriter(4);
  w.pushBits(eciDesignator(assignment), eciWidth(assignment));
  return { mode: 'eci', charCount: 0, bits: w.toBitArray() };
};

// ---------------------------------------------------------------------------
// Optimal segmentation
// ---------------------------------------------------------------------------

/** Modes the optimiser considers, in a fixed order the DP indexes by. */
const MODES = ['byte', 'alphanumeric', 'numeric', 'kanji'] as const;
type OptMode = (typeof MODES)[number];

/**
 * One Unicode code point, with everything the optimiser needs to price it.
 *
 * Working in code points rather than UTF-16 units is what lets the optimiser
 * handle mixed scripts. A naive per-`char` pass silently mis-costs astral
 * characters and gives up entirely on any string containing them, which is
 * why several libraries encode `"emoji 12345678901234567890"` as one byte
 * segment and waste a version.
 */
interface Unit {
  readonly text: string;
  /** UTF-8 length, which is what byte mode's character count measures. */
  readonly byteLen: number;
  readonly numeric: boolean;
  readonly alnum: boolean;
  /** 13-bit Kanji payload when the table accepts this code point. */
  readonly kanji: number | undefined;
}

const encoder = new TextEncoder();

const toUnits = (text: string, allowKanji: boolean): Unit[] => {
  const table = allowKanji ? getKanjiTable() : null;
  const units: Unit[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    const sjis = table ? table(cp) : undefined;
    units.push({
      text: ch,
      byteLen: encoder.encode(ch).length,
      numeric: ch.length === 1 && isNumericChar(ch),
      alnum: ch.length === 1 && ALPHANUMERIC_INDEX.has(ch),
      kanji: sjis === undefined ? undefined : shiftJisToKanjiBits(sjis),
    });
  }
  return units;
};

/**
 * Per-character cost in sixths of a bit.
 *
 * Numeric mode spends 10 bits per 3 characters and alphanumeric 11 per 2, so
 * their true per-character costs are 10/3 and 11/2. Sixths is the smallest
 * unit that makes both exact, which keeps the whole dynamic program in
 * integers — floating point here produces different segmentations on different
 * inputs for no reason anyone can debug.
 */
const SIXTHS_NUMERIC = 20; // 10/3 bits
const SIXTHS_ALNUM = 33; // 11/2 bits
const SIXTHS_KANJI = 78; // 13 bits
const SIXTHS_PER_BYTE = 48; // 8 bits

/** A contiguous run assigned to one mode. */
export interface SegmentPlan {
  readonly mode: OptMode;
  /** Unit indices, half-open. */
  readonly start: number;
  readonly end: number;
}

export interface Plan {
  readonly units: Unit[];
  readonly segments: SegmentPlan[];
  /** Total bits including every mode indicator and count field. */
  readonly bits: number;
}

/**
 * Choose the cheapest assignment of characters to modes for a given QR version.
 *
 * Version matters because count-field widths do, so a string can segment
 * differently at version 9 and version 10.
 */
export const planSegments = (text: string, version: number, allowKanji = false): Plan =>
  planSegmentsWith(text, qrModel(version), allowKanji);

/**
 * Choose the cheapest assignment of characters to modes under any symbology.
 *
 * A Viterbi pass over four modes: for each character, carry the cheapest
 * running cost of *ending* in each mode, then walk the backpointers. Modes the
 * model reports as unavailable are priced at infinity, which is how Micro QR
 * M2 — alphanumeric and numeric only — rules out byte mode without a second
 * code path.
 *
 * When no assignment exists at all (a lowercase letter in an M2 symbol, say)
 * the returned plan has no segments and `bits` is infinite, so a caller
 * searching versions can move on to the next one.
 */
export const planSegmentsWith = (text: string, model: SymbologyModel, allowKanji = false): Plan => {
  const units = toUnits(text, allowKanji);
  if (units.length === 0) return { units, segments: [], bits: 0 };

  const widths = MODES.map((mode) => model.countBits(mode));
  const headCost = (m: number): number => {
    const cb = widths[m];
    return cb === null ? Number.POSITIVE_INFINITY : (model.modeBits + cb) * 6;
  };

  // Cost of a run that has just opened in each mode, before any character.
  let costs = MODES.map((_, m) => headCost(m));
  const back: Int8Array[] = [];

  for (const unit of units) {
    const charCost: (number | null)[] = [
      widths[0] === null ? null : unit.byteLen * SIXTHS_PER_BYTE,
      widths[1] !== null && unit.alnum ? SIXTHS_ALNUM : null,
      widths[2] !== null && unit.numeric ? SIXTHS_NUMERIC : null,
      widths[3] !== null && unit.kanji !== undefined ? SIXTHS_KANJI : null,
    ];

    const next = new Array<number>(MODES.length);
    const from = new Int8Array(MODES.length);

    for (let m = 0; m < MODES.length; m++) {
      const cc = charCost[m];
      if (cc === null) {
        next[m] = Number.POSITIVE_INFINITY;
        from[m] = -1;
        continue;
      }

      let best = Number.POSITIVE_INFINITY;
      let bestFrom = -1;
      for (let p = 0; p < MODES.length; p++) {
        if (!Number.isFinite(costs[p])) continue;
        // Staying in a mode is free. Switching rounds the running total up to
        // a whole bit first, because a real encoder cannot carry a fractional
        // bit across a mode boundary, then pays a fresh header.
        const base = p === m ? costs[p] : Math.ceil(costs[p] / 6) * 6 + headCost(m);
        // Ties go to staying put. Two encodings of the same length are equally
        // valid, and the one with fewer mode switches is the one every other
        // implementation produces, which keeps conformance comparisons honest.
        if (base < best || (base === best && p === m)) {
          best = base;
          bestFrom = p;
        }
      }

      next[m] = best + cc;
      from[m] = bestFrom;
    }

    costs = next;
    back.push(from);
  }

  let end = 0;
  for (let m = 1; m < MODES.length; m++) if (costs[m] < costs[end]) end = m;
  // No mode this symbology offers can represent the text.
  if (!Number.isFinite(costs[end])) {
    return { units, segments: [], bits: Number.POSITIVE_INFINITY };
  }

  const path = new Int8Array(units.length);
  let cur = end;
  for (let i = units.length - 1; i >= 0; i--) {
    path[i] = cur;
    cur = back[i][cur];
  }

  const segments: SegmentPlan[] = [];
  let start = 0;
  for (let i = 1; i <= units.length; i++) {
    if (i === units.length || path[i] !== path[start]) {
      segments.push({ mode: MODES[path[start]], start, end: i });
      start = i;
    }
  }

  return { units, segments, bits: Math.ceil(costs[end] / 6) };
};

/** Character count a planned run contributes to its mode's count field. */
const planCharCount = (plan: Plan, seg: SegmentPlan): number => {
  if (seg.mode !== 'byte') return seg.end - seg.start;
  let n = 0;
  for (let i = seg.start; i < seg.end; i++) n += plan.units[i].byteLen;
  return n;
};

/** Materialise a {@link Plan} into real segments. */
export const buildSegments = (plan: Plan): QrSegment[] =>
  plan.segments.map((seg) => {
    const text = plan.units
      .slice(seg.start, seg.end)
      .map((u) => u.text)
      .join('');
    switch (seg.mode) {
      case 'numeric':
        return makeNumericSegment(text);
      case 'alphanumeric':
        return makeAlphanumericSegment(text);
      case 'kanji':
        return makeKanjiSegment(text);
      default:
        return makeByteSegment(encoder.encode(text));
    }
  });

/** Convenience: plan and materialise in one step. */
export const makeSegments = (text: string, version: number, allowKanji = false): QrSegment[] =>
  buildSegments(planSegments(text, version, allowKanji));

/**
 * Total bits ready-made segments occupy under a symbology, headers included.
 *
 * Returns Infinity when a segment cannot be written there at all — the mode is
 * unavailable, or a character count overflows its field. Either way the symbol
 * cannot carry it however much room the codewords appear to leave, and
 * treating it as merely expensive would produce a corrupt symbol.
 */
export const segmentBits = (segments: readonly QrSegment[], model: SymbologyModel): number => {
  let total = 0;
  for (const seg of segments) {
    const cb = model.countBits(seg.mode);
    if (cb === null) return Number.POSITIVE_INFINITY;
    // Header modes have a zero-width count field and a zero count, so this
    // never fires for them.
    if (seg.charCount >= 1 << cb) return Number.POSITIVE_INFINITY;
    total += model.modeBits + cb + seg.bits.length;
  }
  return total;
};

/** Total bits these segments occupy in a full QR symbol at `version`. */
export const totalBits = (segments: readonly QrSegment[], version: number): number =>
  segmentBits(segments, qrModel(version));

/** Bit cost of a plan at `version`, without materialising it. */
export const planBits = (plan: Plan, version: number): number =>
  planBitsWith(plan, qrModel(version));

/**
 * Bit cost of a plan under any symbology, without materialising it.
 *
 * Infinite when the plan cannot be written at all: no assignment was found, a
 * mode is unavailable here, or a character count overflows its field — all of
 * which mean "try a larger symbol" rather than "this is merely expensive".
 */
export const planBitsWith = (plan: Plan, model: SymbologyModel): number => {
  if (plan.segments.length === 0) {
    return plan.units.length === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (const seg of plan.segments) {
    const cb = model.countBits(seg.mode);
    if (cb === null) return Number.POSITIVE_INFINITY;
    const count = planCharCount(plan, seg);
    if (count >= 1 << cb) return Number.POSITIVE_INFINITY;
    let payload: number;
    switch (seg.mode) {
      case 'numeric': {
        const n = seg.end - seg.start;
        payload = Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
        break;
      }
      case 'alphanumeric': {
        const n = seg.end - seg.start;
        payload = Math.floor(n / 2) * 11 + (n % 2) * 6;
        break;
      }
      case 'kanji':
        payload = (seg.end - seg.start) * 13;
        break;
      default:
        payload = count * 8;
    }
    total += model.modeBits + cb + payload;
  }
  return total;
};

export type { BitArray, OptMode };
