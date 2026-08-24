/**
 * rMQR — Rectangular Micro QR (ISO/IEC 23941, 2022).
 *
 * A symbology for surfaces that are long and thin: test tubes, cable wraps,
 * PCB edges, the spine of a component. Neither a square QR symbol nor a Micro
 * QR symbol fits there, so the standard defines 32 fixed rectangles from 7x43
 * up to 17x139 — the widest is nearly twenty times wider than it is tall.
 *
 * Structurally it borrows from both of its predecessors and matches neither:
 *
 * - A full 7x7 finder pattern top-left, and a 5x5 *sub*-finder bottom-right.
 * - Corner finder patterns at the other two corners, which are a handful of
 *   fixed modules rather than a pattern.
 * - 3x3 alignment patterns along the top and bottom edges, with a vertical
 *   timing pattern running down each alignment column as well as both sides.
 * - Exactly one mask pattern. There is no mask selection to do.
 * - Error correction at M or H only; no L, no Q.
 * - 18-bit format information carrying a version indicator, written twice with
 *   two *different* XOR masks.
 *
 * As with Micro QR, correctness here cannot be established by round-tripping
 * through our own decoder — a wrong table value produces a self-consistent
 * symbol that no real scanner accepts. Every version and level is instead
 * compared module-for-module against `rmqrcode`, an independent MIT-licensed
 * implementation of the same standard.
 */

import { BitWriter } from './bits.js';
import { computeDivisor, computeRemainder } from './galois.js';
import {
  RMQR_ALIGNMENT_COLUMNS,
  RMQR_SPECS,
  RMQR_VERSIONS,
  type RmqrLevel,
  type RmqrVersion,
} from './rmqr-tables.js';
import {
  ALPHANUMERIC_CHARSET,
  makeAlphanumericSegment,
  makeByteSegment,
  makeNumericSegment,
} from './segment.js';
import { MODULE, QrCapacityError, type QrMatrix } from './types.js';

export type { RmqrLevel, RmqrVersion };
export { RMQR_SPECS, RMQR_VERSIONS };

/** Mode indicators, §7.4.1. Three bits, unlike QR's four. */
const MODE_INDICATOR = { numeric: 1, alphanumeric: 2, byte: 3, kanji: 4 } as const;
type RmqrMode = keyof typeof MODE_INDICATOR;

/**
 * The single mask pattern, §7.8.
 *
 * rMQR defines exactly one, so there is no penalty scoring and no eight-way
 * trial — a meaningful simplification over both QR and Micro QR.
 */
export const rmqrMask = (x: number, y: number): boolean =>
  (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;

/**
 * BCH(18,6) format information.
 *
 * Six data bits — a five-bit version indicator plus one bit for the error
 * correction level — and twelve parity bits under the generator
 * x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1.
 */
export const rmqrFormatBits = (indicator: number, level: RmqrLevel): number => {
  const data = indicator | (level === 'H' ? 1 << 5 : 0);
  let remainder = data << 12;
  const generator = 0x1f25;
  // Long division over GF(2): clear the high bit repeatedly until the
  // remainder is below degree 12.
  for (let bit = 17; bit >= 12; bit--) {
    if ((remainder >>> bit) & 1) remainder ^= generator << (bit - 12);
  }
  return ((data << 12) | remainder) >>> 0;
};

/**
 * Two copies of the format information are written, each pre-masked with its
 * own pattern so the two copies cannot be confused for one another.
 */
const FORMAT_MASK_FINDER = 0b011111101010110010;
const FORMAT_MASK_SUB_FINDER = 0b100000101001111011;

interface Grid {
  width: number;
  height: number;
  modules: Uint8Array;
  kinds: Uint8Array;
  /** Whether each cell has been assigned yet; function patterns claim theirs first. */
  filled: Uint8Array;
}

const put = (g: Grid, x: number, y: number, dark: boolean, kind: number): void => {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return;
  const i = y * g.width + x;
  g.modules[i] = dark ? 1 : 0;
  g.kinds[i] = kind;
  g.filled[i] = 1;
};

/** Fill a cell only if nothing has claimed it — the timing patterns work this way. */
const putIfEmpty = (g: Grid, x: number, y: number, dark: boolean, kind: number): void => {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return;
  if (g.filled[y * g.width + x]) return;
  put(g, x, y, dark, kind);
};

const drawFinder = (g: Grid): void => {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      put(g, x, y, x === 0 || x === 6 || y === 0 || y === 6, MODULE.FINDER);
    }
  }
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) put(g, 2 + x, 2 + y, true, MODULE.FINDER);
  }
  // Separator down the right edge of the finder, and along its bottom when the
  // symbol is tall enough to have one.
  for (let n = 0; n < 8; n++) {
    if (n < g.height) put(g, 7, n, false, MODULE.SEPARATOR);
    if (g.height >= 9) put(g, n, 7, false, MODULE.SEPARATOR);
  }
};

/** The 5x5 sub-finder in the opposite corner, which has no separator. */
const drawSubFinder = (g: Grid): void => {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dark = i === 0 || i === 4 || j === 0 || j === 4;
      put(g, g.width - j - 1, g.height - i - 1, dark, MODULE.FINDER);
    }
  }
  put(g, g.width - 3, g.height - 3, true, MODULE.FINDER);
};

/**
 * Corner finder patterns at the remaining two corners.
 *
 * Not patterns so much as a few fixed modules that give a decoder something to
 * lock onto where there is no room for anything larger.
 */
const drawCornerFinders = (g: Grid): void => {
  const bottom = g.height - 1;
  put(g, 0, bottom, true, MODULE.FINDER);
  put(g, 1, bottom, true, MODULE.FINDER);
  put(g, 2, bottom, true, MODULE.FINDER);
  if (g.height >= 11) {
    put(g, 0, bottom - 1, true, MODULE.FINDER);
    put(g, 1, bottom - 1, false, MODULE.FINDER);
  }

  put(g, g.width - 1, 0, true, MODULE.FINDER);
  put(g, g.width - 2, 0, true, MODULE.FINDER);
  put(g, g.width - 1, 1, true, MODULE.FINDER);
  put(g, g.width - 2, 1, false, MODULE.FINDER);
};

/** 3x3 alignment patterns on the top and bottom edges at each alignment column. */
const drawAlignment = (g: Grid): void => {
  for (const centre of RMQR_ALIGNMENT_COLUMNS[g.width] ?? []) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dark = i === 0 || i === 2 || j === 0 || j === 2;
        put(g, centre + j - 1, i, dark, MODULE.ALIGNMENT);
        put(g, centre + j - 1, g.height - 1 - i, dark, MODULE.ALIGNMENT);
      }
    }
  }
};

/**
 * Timing patterns: along the top and bottom rows, and down both side columns
 * plus every alignment column. Only empty cells are filled, so the finders and
 * alignment patterns already placed keep their modules.
 */
const drawTiming = (g: Grid): void => {
  for (let x = 0; x < g.width; x++) {
    const dark = (x + 1) % 2 === 1;
    putIfEmpty(g, x, 0, dark, MODULE.TIMING);
    putIfEmpty(g, x, g.height - 1, dark, MODULE.TIMING);
  }
  const columns = [0, g.width - 1, ...(RMQR_ALIGNMENT_COLUMNS[g.width] ?? [])];
  for (let y = 0; y < g.height; y++) {
    const dark = (y + 1) % 2 === 1;
    for (const x of columns) putIfEmpty(g, x, y, dark, MODULE.TIMING);
  }
};

/** Write both copies of the format information, each under its own XOR mask. */
const drawFormat = (g: Grid, indicator: number, level: RmqrLevel): void => {
  const bits = rmqrFormatBits(indicator, level);

  // Finder side: an 18-module block beside the finder pattern, filled column
  // by column in runs of five.
  const finder = bits ^ FORMAT_MASK_FINDER;
  for (let n = 0; n < 18; n++) {
    put(g, 8 + Math.floor(n / 5), 1 + (n % 5), ((finder >>> n) & 1) !== 0, MODULE.FORMAT);
  }

  // Sub-finder side: fifteen modules in the same shape, plus three that do not
  // fit the pattern and are placed individually.
  const sub = bits ^ FORMAT_MASK_SUB_FINDER;
  const baseY = g.height - 6;
  const baseX = g.width - 8;
  for (let n = 0; n < 15; n++) {
    put(g, baseX + Math.floor(n / 5), baseY + (n % 5), ((sub >>> n) & 1) !== 0, MODULE.FORMAT);
  }
  put(g, g.width - 5, baseY, ((sub >>> 15) & 1) !== 0, MODULE.FORMAT);
  put(g, g.width - 4, baseY, ((sub >>> 16) & 1) !== 0, MODULE.FORMAT);
  put(g, g.width - 3, baseY, ((sub >>> 17) & 1) !== 0, MODULE.FORMAT);
};

/**
 * The order data bits are written.
 *
 * Two-module columns walked right to left, alternating up and down — the same
 * idea as QR, but bounded by rows 1 and height-2 rather than the full height,
 * because the top and bottom rows are entirely timing and alignment. The walk
 * starts beside the sub-finder rather than in the corner.
 */
export const rmqrDataSequence = (g: Grid): number[] => {
  const order: number[] = [];
  let x = g.width - 2;
  let y = g.height - 6;
  let dy = -1;

  // Bounded rather than `while (true)`: a malformed table could otherwise spin
  // forever instead of failing.
  const limit = g.width * g.height * 2;
  for (let step = 0; step < limit && x >= 0; step++) {
    for (const cx of [x, x - 1]) {
      if (cx < 0) continue;
      const i = y * g.width + cx;
      if (!g.filled[i]) order.push(i);
    }

    if (dy < 0 && y === 1) {
      x -= 2;
      dy = 1;
    } else if (dy > 0 && y === g.height - 2) {
      x -= 2;
      dy = -1;
    } else {
      y += dy;
    }
  }
  return order;
};

/** Split data codewords into blocks, append parity, and interleave. */
const addEccAndInterleave = (
  data: Uint8Array,
  groups: readonly { num: number; c: number; k: number }[],
): Uint8Array => {
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];

  let offset = 0;
  for (const group of groups) {
    for (let i = 0; i < group.num; i++) {
      const block = data.subarray(offset, offset + group.k);
      offset += group.k;
      dataBlocks.push(block);
      eccBlocks.push(computeRemainder(block, computeDivisor(group.c - group.k)));
    }
  }

  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  const maxEcc = Math.max(...eccBlocks.map((b) => b.length));
  for (let i = 0; i < maxEcc; i++) {
    for (const block of eccBlocks) if (i < block.length) out.push(block[i]);
  }
  return Uint8Array.from(out);
};

export interface RmqrEncodeOptions {
  /** Error correction level. rMQR offers M and H only; defaults to M. */
  ecc?: RmqrLevel;
  /** Force a specific size instead of choosing one that fits. */
  version?: RmqrVersion;
  /**
   * Which shape to prefer when choosing automatically.
   *
   * `'width'` picks the widest, flattest symbol that fits — the usual choice,
   * since rMQR exists for narrow surfaces. `'height'` prefers taller, shorter
   * ones. `'area'` minimises total modules regardless of shape.
   */
  fit?: 'width' | 'height' | 'area';
}

const detectMode = (text: string): RmqrMode => {
  if (/^[0-9]*$/.test(text)) return 'numeric';
  if ([...text].every((c) => ALPHANUMERIC_CHARSET.includes(c))) return 'alphanumeric';
  return 'byte';
};

/** Bits the payload needs at a given version, including headers. */
const requiredBits = (text: string, mode: RmqrMode, version: RmqrVersion): number => {
  const spec = RMQR_SPECS[version];
  const countBits = spec.countBits[mode];
  const segment =
    mode === 'numeric'
      ? makeNumericSegment(text)
      : mode === 'alphanumeric'
        ? makeAlphanumericSegment(text)
        : makeByteSegment(new TextEncoder().encode(text));
  return 3 + countBits + segment.bits.length;
};

/**
 * Encode an rMQR symbol.
 *
 * @example encodeRmqr('https://example.com')
 * @example encodeRmqr('SERIAL-4417', { ecc: 'H', fit: 'width' })
 * @example encodeRmqr('12345', { version: 'R7x43' })
 */
export const encodeRmqr = (text: string, options: RmqrEncodeOptions = {}): QrMatrix => {
  const { ecc = 'M', version: forced, fit = 'width' } = options;
  const mode = detectMode(text);

  let chosen: RmqrVersion | undefined = forced;
  if (!chosen) {
    const candidates = RMQR_VERSIONS.filter(
      (v) => requiredBits(text, mode, v) <= RMQR_SPECS[v].dataBits[ecc],
    );
    if (candidates.length > 0) {
      const score = (v: RmqrVersion): number => {
        const spec = RMQR_SPECS[v];
        if (fit === 'area') return spec.width * spec.height;
        // Prefer the flattest (or tallest) symbol, breaking ties on area so the
        // result is the smallest of the preferred shape rather than any of them.
        const primary = fit === 'width' ? spec.height : spec.width;
        return primary * 10_000 + spec.width * spec.height;
      };
      chosen = candidates.reduce((best, v) => (score(v) < score(best) ? v : best));
    }
  }

  if (!chosen) {
    const largest = RMQR_VERSIONS[RMQR_VERSIONS.length - 1];
    throw new QrCapacityError(
      requiredBits(text, mode, largest),
      RMQR_SPECS[largest].dataBits[ecc],
      0,
    );
  }

  const spec = RMQR_SPECS[chosen];
  const capacity = spec.dataBits[ecc];
  const needed = requiredBits(text, mode, chosen);
  if (needed > capacity) throw new QrCapacityError(needed, capacity, 0);

  // --- data codewords -----------------------------------------------------
  const groups = spec.blocks[ecc];
  const dataCodewords = groups.reduce((total, g) => total + g.num * g.k, 0);

  const w = new BitWriter(dataCodewords);
  w.pushBits(MODE_INDICATOR[mode], 3);
  const segment =
    mode === 'numeric'
      ? makeNumericSegment(text)
      : mode === 'alphanumeric'
        ? makeAlphanumericSegment(text)
        : makeByteSegment(new TextEncoder().encode(text));
  w.pushBits(segment.charCount, spec.countBits[mode]);
  w.pushArray(segment.bits);

  // Terminator of up to three bits, then pad to the codeword boundary and fill
  // with the same alternating pad codewords QR uses.
  w.pushBits(0, Math.min(3, capacity - w.length));
  w.padToByte();

  const data = new Uint8Array(dataCodewords);
  w.copyInto(data);
  for (let i = w.length >>> 3, p = 0; i < dataCodewords; i++, p++) {
    data[i] = p % 2 === 0 ? 0xec : 0x11;
  }

  const codewords = addEccAndInterleave(data, groups);

  // --- layout -------------------------------------------------------------
  const g: Grid = {
    width: spec.width,
    height: spec.height,
    modules: new Uint8Array(spec.width * spec.height),
    kinds: new Uint8Array(spec.width * spec.height),
    filled: new Uint8Array(spec.width * spec.height),
  };

  drawFinder(g);
  drawSubFinder(g);
  drawCornerFinders(g);
  drawAlignment(g);
  drawTiming(g);
  drawFormat(g, spec.indicator, ecc);

  const order = rmqrDataSequence(g);
  const totalBits = codewords.length * 8;
  for (let i = 0; i < order.length; i++) {
    const index = order[i];
    // Anything past the codewords is a remainder module, left light.
    const bit = i < totalBits ? (codewords[i >>> 3] >>> (7 - (i & 7))) & 1 : 0;
    g.modules[index] = bit;
    g.kinds[index] = MODULE.DATA;
    // Exactly one mask, applied as the modules are placed.
    if (rmqrMask(index % g.width, Math.floor(index / g.width))) g.modules[index] ^= 1;
  }

  return {
    // `size` is the longer side; consumers that need both read `width`/`height`.
    size: Math.max(spec.width, spec.height),
    width: spec.width,
    height: spec.height,
    version: spec.indicator + 1,
    variant: 'rmqr',
    ecc: ecc as QrMatrix['ecc'],
    mask: 0,
    modules: g.modules,
    kinds: g.kinds,
  };
};

/** The rMQR size label for a matrix produced by {@link encodeRmqr}. */
export const rmqrVersionOf = (matrix: Pick<QrMatrix, 'version'>): RmqrVersion =>
  RMQR_VERSIONS[matrix.version - 1];
