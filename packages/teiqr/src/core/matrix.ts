/**
 * Module placement, masking and mask selection.
 *
 * Everything here follows ISO/IEC 18004 §7.7-7.9. The one part worth reading
 * closely is {@link penaltyScore}: it is where several widely-used encoders
 * quietly diverge from the standard and pick a non-conformant mask.
 */

import { type EccLevel, MODULE, type QrMatrix } from './types.js';
import { alignmentPatternPositions, ECC_FORMAT_BITS, sizeForVersion } from './version.js';

/** §7.8.3 Table 11 penalty weights. */
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/**
 * §7.8.2 Table 10. Index is the mask reference, 0-7.
 *
 * Exported because the decoder must undo exactly the mask the encoder applied.
 * Two copies of this table is a classic source of encoder/decoder drift.
 */
export const MASK_FUNCTIONS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

const getBit = (value: number, index: number): boolean => ((value >>> index) & 1) !== 0;

interface Grid {
  size: number;
  modules: Uint8Array;
  kinds: Uint8Array;
}

const setFn = (g: Grid, x: number, y: number, dark: boolean, kind: number): void => {
  if (x < 0 || y < 0 || x >= g.size || y >= g.size) return;
  g.modules[y * g.size + x] = dark ? 1 : 0;
  g.kinds[y * g.size + x] = kind;
};

const drawFinder = (g: Grid, ox: number, oy: number): void => {
  // The separator is the light ring one module outside the 7x7, so sweep -1..7.
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = ox + dx;
      const y = oy + dy;
      if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue;

      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      if (!inside) {
        setFn(g, x, y, false, MODULE.SEPARATOR);
        continue;
      }
      // Chebyshev distance from the centre: 0-1 is the dark core, 2 the light
      // ring, 3 the dark border.
      const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      setFn(g, x, y, dist !== 2, MODULE.FINDER);
    }
  }
};

const drawAlignment = (g: Grid, cx: number, cy: number): void => {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(g, cx + dx, cy + dy, dist !== 1, MODULE.ALIGNMENT);
    }
  }
};

/** 15-bit format information: 5 data bits, BCH(15,5) parity, XOR mask 0x5412. */
export const formatBits = (ecc: EccLevel, mask: number): number => {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
};

/** 18-bit version information: 6 data bits plus BCH(18,6) parity. */
export const versionBits = (version: number): number => {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return ((version << 12) | rem) >>> 0;
};

const drawFormatBits = (g: Grid, ecc: EccLevel, mask: number): void => {
  const bits = formatBits(ecc, mask);

  // First copy, wrapped around the top-left finder.
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, getBit(bits, i), MODULE.FORMAT);
  setFn(g, 8, 7, getBit(bits, 6), MODULE.FORMAT);
  setFn(g, 8, 8, getBit(bits, 7), MODULE.FORMAT);
  setFn(g, 7, 8, getBit(bits, 8), MODULE.FORMAT);
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, getBit(bits, i), MODULE.FORMAT);

  // Second copy, split between the other two finders.
  for (let i = 0; i < 8; i++) setFn(g, g.size - 1 - i, 8, getBit(bits, i), MODULE.FORMAT);
  for (let i = 8; i < 15; i++) setFn(g, 8, g.size - 15 + i, getBit(bits, i), MODULE.FORMAT);

  // The one permanently dark module, §7.9.1.
  setFn(g, 8, g.size - 8, true, MODULE.DARK);
};

const drawVersionBits = (g: Grid, version: number): void => {
  if (version < 7) return;
  const bits = versionBits(version);

  for (let i = 0; i < 18; i++) {
    const bit = getBit(bits, i);
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(g, a, b, bit, MODULE.VERSION);
    setFn(g, b, a, bit, MODULE.VERSION);
  }
};

const drawFunctionPatterns = (g: Grid, version: number, ecc: EccLevel): void => {
  const { size } = g;

  // Timing runs only between the separators; the corners belong to the finders.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setFn(g, 6, i, dark, MODULE.TIMING);
    setFn(g, i, 6, dark, MODULE.TIMING);
  }

  drawFinder(g, 0, 0);
  drawFinder(g, size - 7, 0);
  drawFinder(g, 0, size - 7);

  const positions = alignmentPatternPositions(version);
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // The three finder corners already own these cells.
      const isCorner = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
      if (!isCorner) drawAlignment(g, positions[i], positions[j]);
    }
  }

  // Reserve the format and version areas. Real format values are written per mask.
  drawFormatBits(g, ecc, 0);
  drawVersionBits(g, version);
};

/**
 * The order data bits are written into the grid: two-module-wide columns
 * walked right to left, alternating upward and downward, skipping function
 * patterns.
 *
 * Exported because two other subsystems need the same walk. The validator runs
 * it to work out which codewords a logo actually damages, and the verifier
 * runs it in reverse to read a symbol back. Deriving all three from one
 * function is what keeps them from drifting apart.
 */
export const dataModuleSequence = (size: number, kinds: Uint8Array): Int32Array => {
  const order = new Int32Array(size * size);
  let count = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern; the pairing shifts left past it.
    if (right === 6) right = 5;

    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        const idx = y * size + x;
        if (kinds[idx] === MODULE.DATA) order[count++] = idx;
      }
    }
  }

  return order.subarray(0, count);
};

const placeCodewords = (g: Grid, data: Uint8Array, order: Int32Array): void => {
  const bits = data.length * 8;
  for (let i = 0; i < order.length && i < bits; i++) {
    g.modules[order[i]] = (data[i >>> 3] >>> (7 - (i & 7))) & 1;
  }
};

const applyMask = (g: Grid, mask: number, order: Int32Array): void => {
  const fn = MASK_FUNCTIONS[mask];
  const { size } = g;
  // Walking the precomputed data sequence skips the function-pattern test
  // entirely, which is the whole inner loop of the eight-mask trial.
  for (let i = 0; i < order.length; i++) {
    const idx = order[i];
    if (fn(idx % size, (idx / size) | 0)) g.modules[idx] ^= 1;
  }
};

const finderPenaltyAddHistory = (size: number, runLength: number, history: number[]): void => {
  // A run that starts at the edge is preceded by the quiet zone, which counts
  // as light for the 1:1:3:1:1 test.
  const length = history[0] === 0 ? runLength + size : runLength;
  history.pop();
  history.unshift(length);
};

const finderPenaltyCountPatterns = (history: number[]): number => {
  const n = history[1];
  const core =
    n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (
    (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
    (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
  );
};

const finderPenaltyTerminate = (
  size: number,
  runColor: boolean,
  runLength: number,
  history: number[],
): number => {
  let length = runLength;
  if (runColor) {
    finderPenaltyAddHistory(size, length, history);
    length = 0;
  }
  length += size; // trailing quiet zone
  finderPenaltyAddHistory(size, length, history);
  return finderPenaltyCountPatterns(history);
};

/**
 * ISO/IEC 18004 §7.8.3 penalty score. Lower is better.
 *
 * Feature 4 is the subtle one. Table 11 defines it as `N4 * k` where k "rates
 * the deviation of the proportion of dark modules from 50% in steps of 5%",
 * with the note that the score is 0 between 45% and 55% and 10 between 40%
 * and 60%. That makes k the number of *complete* 5% steps, counted
 * symmetrically, which is what the expression below computes.
 *
 * Getting this wrong is easy and consequential: the most-downloaded QR
 * encoder on npm rounds one side of 50% and truncates the other, so it selects
 * a different mask than the standard requires on half of all symbols. The
 * result still scans, but it is not conformant. A regression test pins this
 * against a brute-force check of the spec text across every version.
 */
export const penaltyScore = (g: Grid): number => {
  const { size, modules } = g;
  let result = 0;

  const scanLine = (get: (i: number) => number): void => {
    let runColor = 0;
    let runLength = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < size; i++) {
      if (get(i) === runColor) {
        runLength++;
        if (runLength === 5) result += PENALTY_N1;
        else if (runLength > 5) result++;
      } else {
        finderPenaltyAddHistory(size, runLength, history);
        if (runColor === 0) result += finderPenaltyCountPatterns(history) * PENALTY_N3;
        runColor = get(i);
        runLength = 1;
      }
    }
    result += finderPenaltyTerminate(size, runColor === 1, runLength, history) * PENALTY_N3;
  };

  for (let y = 0; y < size; y++) scanLine((x) => modules[y * size + x]);
  for (let x = 0; x < size; x++) scanLine((y) => modules[y * size + x]);

  // Feature 2: 2x2 blocks of a single colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y * size + x];
      if (
        c === modules[y * size + x + 1] &&
        c === modules[(y + 1) * size + x] &&
        c === modules[(y + 1) * size + x + 1]
      ) {
        result += PENALTY_N2;
      }
    }
  }

  // Feature 4: deviation from an even dark/light split, in complete 5% steps.
  // `dark * 20 - total * 10` is `total * (20p - 10)`, so dividing by total
  // gives 20|p - 0.5| — the deviation measured in 5% steps — without ever
  // leaving integer arithmetic. Module counts are always odd squared, so the
  // deviation is never exactly zero and `ceil(d) - 1` cannot go negative.
  let dark = 0;
  for (const m of modules) dark += m;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
};

/**
 * Place codewords, choose a mask, and return the finished symbol.
 *
 * When `maskOverride` is absent all eight masks are trialled and the
 * lowest-penalty one wins, as the standard requires. XOR is its own inverse,
 * so each trial is undone by reapplying the same mask rather than by copying
 * the grid.
 */
/**
 * The module-role map for a version, with no data placed.
 *
 * The verifier needs this: after reading a grid of light and dark modules out
 * of an image it knows nothing about which cells are function patterns, and
 * {@link dataModuleSequence} cannot run without that. Regenerating the roles
 * from the version alone is exact, because function patterns depend on nothing
 * but the version.
 */
export const functionPatternKinds = (version: number, ecc: EccLevel = 'M'): Uint8Array => {
  const size = sizeForVersion(version);
  const g: Grid = {
    size,
    modules: new Uint8Array(size * size),
    kinds: new Uint8Array(size * size),
  };
  drawFunctionPatterns(g, version, ecc);
  return g.kinds;
};

export const buildMatrix = (
  version: number,
  ecc: EccLevel,
  codewords: Uint8Array,
  maskOverride?: number,
): QrMatrix => {
  const size = sizeForVersion(version);
  const g: Grid = {
    size,
    modules: new Uint8Array(size * size),
    kinds: new Uint8Array(size * size),
  };

  drawFunctionPatterns(g, version, ecc);
  const order = dataModuleSequence(size, g.kinds);
  placeCodewords(g, codewords, order);

  let mask = maskOverride;
  if (mask === undefined) {
    let best = Number.POSITIVE_INFINITY;
    for (let m = 0; m < 8; m++) {
      applyMask(g, m, order);
      drawFormatBits(g, ecc, m);
      const score = penaltyScore(g);
      if (score < best) {
        best = score;
        mask = m;
      }
      applyMask(g, m, order);
    }
  }

  const chosen = mask ?? 0;
  applyMask(g, chosen, order);
  drawFormatBits(g, ecc, chosen);

  return { size, version, ecc, mask: chosen, modules: g.modules, kinds: g.kinds };
};

export type { Grid };
