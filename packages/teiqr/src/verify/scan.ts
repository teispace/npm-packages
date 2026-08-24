/**
 * Read a QR symbol out of a pixel buffer.
 *
 * This is the piece that turns "the coverage analysis says this should scan"
 * into "this demonstrably scans". It locates the three finder patterns the way
 * a real decoder does — by looking for the 1:1:3:1:1 run ratio — derives the
 * module grid from them, samples it, and hands the result to
 * {@link decodeMatrix} for Reed-Solomon recovery.
 *
 * ### Scope
 * Deliberately built for verifying rendered output rather than decoding
 * photographs: it assumes the symbol is axis-aligned and unskewed, which is
 * true of anything this library rasterises and untrue of a camera capture.
 * That assumption buys a small, dependency-free implementation. For camera
 * input, use a dedicated scanner.
 */

import { functionPatternKinds } from '../core/matrix.js';
import { MAX_VERSION, MIN_VERSION, sizeForVersion } from '../core/version.js';
import { type DecodeResult, decodeMatrix } from './decode-matrix.js';
import { UncorrectableError } from './reed-solomon.js';

/** Raised when no symbol could be located in the image. */
export class NotFoundError extends Error {
  constructor(message = 'No QR symbol found in the image') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Otsu's method: choose the threshold that minimises intra-class variance.
 *
 * A fixed mid-grey threshold breaks on the low-contrast and inverted styles
 * this library deliberately allows, so the threshold is derived from the
 * image's own histogram instead.
 */
const otsuThreshold = (gray: Uint8Array): number => {
  const histogram = new Int32Array(256);
  for (const value of gray) histogram[value]++;

  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
};

/** Composite RGBA over white, then convert to luminance. */
const toGray = (pixels: Uint8Array, width: number, height: number): Uint8Array => {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const alpha = pixels[p + 3] / 255;
    // Transparent regions are assumed to sit on white, which is what a printed
    // or on-screen code effectively does.
    const r = pixels[p] * alpha + 255 * (1 - alpha);
    const g = pixels[p + 1] * alpha + 255 * (1 - alpha);
    const b = pixels[p + 2] * alpha + 255 * (1 - alpha);
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return gray;
};

interface Candidate {
  x: number;
  y: number;
  size: number;
}

/** Whether five consecutive runs match the finder's 1:1:3:1:1 ratio. */
const isFinderRatio = (runs: readonly number[]): boolean => {
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
  if (total < 7) return false;
  const unit = total / 7;
  // Half a module of slack per run, which is what ZXing allows.
  const tolerance = unit / 2;
  return (
    Math.abs(unit - runs[0]) < tolerance &&
    Math.abs(unit - runs[1]) < tolerance &&
    Math.abs(3 * unit - runs[2]) < 3 * tolerance &&
    Math.abs(unit - runs[3]) < tolerance &&
    Math.abs(unit - runs[4]) < tolerance
  );
};

/** Confirm a horizontal hit by checking the same ratio vertically. */
const confirmVertical = (
  dark: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
): boolean => {
  const runs = [0, 0, 0, 0, 0];
  let y = cy;
  while (y >= 0 && dark[y * width + cx]) {
    runs[2]++;
    y--;
  }
  while (y >= 0 && !dark[y * width + cx]) {
    runs[1]++;
    y--;
  }
  while (y >= 0 && dark[y * width + cx]) {
    runs[0]++;
    y--;
  }

  y = cy + 1;
  while (y < height && dark[y * width + cx]) {
    runs[2]++;
    y++;
  }
  while (y < height && !dark[y * width + cx]) {
    runs[3]++;
    y++;
  }
  while (y < height && dark[y * width + cx]) {
    runs[4]++;
    y++;
  }

  return runs.every((r) => r > 0) && isFinderRatio(runs);
};

/** Locate finder-pattern centres by row-scanning for the 1:1:3:1:1 ratio. */
const findFinders = (dark: Uint8Array, width: number, height: number): Candidate[] => {
  const hits: Candidate[] = [];

  for (let y = 0; y < height; y++) {
    const runs = [0, 0, 0, 0, 0];
    let state = 0;
    for (let x = 0; x < width; x++) {
      const isDark = dark[y * width + x] === 1;
      // States alternate dark/light starting dark; even states expect dark.
      if (isDark === (state % 2 === 0)) {
        runs[state]++;
      } else if (state === 4) {
        if (isFinderRatio(runs)) {
          const total = runs.reduce((a, b) => a + b, 0);
          const centreX = Math.round(x - runs[4] - runs[3] - runs[2] / 2);
          if (confirmVertical(dark, width, height, centreX, y)) {
            hits.push({ x: centreX, y, size: total / 7 });
          }
        }
        // Shift the window: the last two runs become the first two.
        runs[0] = runs[2];
        runs[1] = runs[3];
        runs[2] = runs[4];
        runs[3] = 1;
        runs[4] = 0;
        state = 3;
      } else {
        state++;
        runs[state] = 1;
      }
    }
    if (state === 4 && isFinderRatio(runs)) {
      const total = runs.reduce((a, b) => a + b, 0);
      const centreX = Math.round(width - runs[4] - runs[3] - runs[2] / 2);
      if (confirmVertical(dark, width, height, centreX, y)) {
        hits.push({ x: centreX, y, size: total / 7 });
      }
    }
  }

  // Cluster hits from adjacent rows into one centre per finder.
  const clusters: { xs: number[]; ys: number[]; sizes: number[] }[] = [];
  for (const hit of hits) {
    const near = clusters.find((c) => {
      const cx = c.xs.reduce((a, b) => a + b, 0) / c.xs.length;
      const cy = c.ys.reduce((a, b) => a + b, 0) / c.ys.length;
      return Math.abs(cx - hit.x) < hit.size * 3 && Math.abs(cy - hit.y) < hit.size * 3;
    });
    if (near) {
      near.xs.push(hit.x);
      near.ys.push(hit.y);
      near.sizes.push(hit.size);
    } else {
      clusters.push({ xs: [hit.x], ys: [hit.y], sizes: [hit.size] });
    }
  }

  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return (
    clusters
      // A genuine finder is hit on many consecutive rows; stray matches are not.
      .filter((c) => c.xs.length >= 3)
      .map((c) => ({ x: mean(c.xs), y: mean(c.ys), size: mean(c.sizes) }))
  );
};

/** Three finder patterns that together describe one symbol. */
export interface SymbolLocation {
  readonly topLeft: Candidate;
  readonly topRight: Candidate;
  readonly bottomLeft: Candidate;
  readonly moduleSize: number;
}

/**
 * Group finder candidates into symbols.
 *
 * An image can hold several codes, so picking the two furthest-apart finders
 * and calling the rest one symbol — which is what a single-code decoder does —
 * produces nonsense the moment there is more than one. Instead every triple of
 * similarly-sized candidates is tested for the right isosceles arrangement the
 * three finders of a QR symbol always form: two equal legs from the top-left
 * corner, and a hypotenuse sqrt(2) times as long.
 */
export const groupFinders = (finders: Candidate[]): SymbolLocation[] => {
  const groups: SymbolLocation[] = [];
  const used = new Set<Candidate>();
  const dist = (a: Candidate, b: Candidate) => Math.hypot(a.x - b.x, a.y - b.y);

  // Prefer tighter triples, so a well-formed symbol claims its finders before
  // a looser accidental arrangement can.
  const triples: { score: number; corner: Candidate; a: Candidate; b: Candidate }[] = [];
  for (let i = 0; i < finders.length; i++) {
    for (let j = i + 1; j < finders.length; j++) {
      for (let k = j + 1; k < finders.length; k++) {
        const trio = [finders[i], finders[j], finders[k]];
        const sizes = trio.map((f) => f.size);
        // Finders of one symbol are the same size; wildly different sizes mean
        // these belong to different codes.
        if (Math.max(...sizes) > Math.min(...sizes) * 1.5) continue;

        for (const corner of trio) {
          const [a, b] = trio.filter((f) => f !== corner);
          const legA = dist(corner, a);
          const legB = dist(corner, b);
          const hyp = dist(a, b);
          if (legA === 0 || legB === 0) continue;
          // Equal legs, and a hypotenuse of sqrt(2) legs, both within 12%.
          if (Math.abs(legA - legB) > legA * 0.12) continue;
          const expected = legA * Math.SQRT2;
          if (Math.abs(hyp - expected) > expected * 0.12) continue;

          const score = Math.abs(legA - legB) / legA + Math.abs(hyp - expected) / expected;
          triples.push({ score, corner, a, b });
        }
      }
    }
  }
  triples.sort((x, y) => x.score - y.score);

  for (const { corner, a, b } of triples) {
    if (used.has(corner) || used.has(a) || used.has(b)) continue;

    // Orientation: the cross product of (a - corner) and (b - corner) tells us
    // which of the two is the top-right and which the bottom-left.
    const cross = (a.x - corner.x) * (b.y - corner.y) - (a.y - corner.y) * (b.x - corner.x);
    const topRight = cross > 0 ? a : b;
    const bottomLeft = cross > 0 ? b : a;

    used.add(corner);
    used.add(a);
    used.add(b);
    groups.push({
      topLeft: corner,
      topRight,
      bottomLeft,
      moduleSize: (corner.size + a.size + b.size) / 3,
    });
  }

  return groups;
};

export interface ScanResult extends DecodeResult {
  /** Module pitch in device pixels, as measured from the finder patterns. */
  readonly moduleSize: number;
  /** Top-left corner of the symbol in the image, in pixels. */
  readonly origin: { x: number; y: number };
}

/**
 * Locate and decode a QR symbol in an RGBA pixel buffer.
 *
 * @param pixels Row-major RGBA, `width * height * 4`.
 * @throws {NotFoundError} when no symbol can be located.
 * @throws {UncorrectableError} when a symbol is found but too damaged to read.
 */
/** Binarise an image once, so multi-symbol scanning does not repeat the work. */
export const binarize = (pixels: Uint8Array, width: number, height: number): Uint8Array => {
  const gray = toGray(pixels, width, height);
  const threshold = otsuThreshold(gray);
  const dark = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] <= threshold ? 1 : 0;
  return dark;
};

/** Sample and decode one located symbol out of a binarised image. */
export const decodeLocation = (
  dark: Uint8Array,
  width: number,
  height: number,
  location: SymbolLocation,
): ScanResult => {
  const { topLeft, topRight, bottomLeft, moduleSize } = location;
  if (moduleSize <= 0) throw new NotFoundError('Degenerate module size');

  // Finder centres sit 3.5 modules in from each edge, so the span between two
  // centres is (dimension - 7) modules.
  const spanX = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const dimension = Math.round(spanX / moduleSize) + 7;
  const version = (dimension - 17) / 4;

  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new NotFoundError(`Derived an implausible symbol size: ${dimension} modules`);
  }

  const size = sizeForVersion(version);
  const pitchX = spanX / (size - 7);
  const spanY = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const pitchY = spanY / (size - 7);

  const originX = topLeft.x - 3.5 * pitchX;
  const originY = topLeft.y - 3.5 * pitchY;

  const modules = new Uint8Array(size * size);
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const px = Math.round(originX + (mx + 0.5) * pitchX);
      const py = Math.round(originY + (my + 0.5) * pitchY);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      modules[my * size + mx] = dark[py * width + px];
    }
  }

  const kinds = functionPatternKinds(version);
  const result = decodeMatrix({ size, version, modules, kinds }, { trustHeader: false });
  return { ...result, moduleSize: (pitchX + pitchY) / 2, origin: { x: originX, y: originY } };
};

/**
 * Locate every symbol in an RGBA pixel buffer, without decoding them.
 *
 * Exposed so a caller scanning video frames can cheaply ask "is there a code
 * in view?" before paying for Reed-Solomon recovery.
 */
export const locateSymbols = (
  pixels: Uint8Array,
  width: number,
  height: number,
): SymbolLocation[] => groupFinders(findFinders(binarize(pixels, width, height), width, height));

/**
 * Locate and decode every QR symbol in an RGBA pixel buffer.
 *
 * Returns them ordered top-to-bottom, then left-to-right, which is reading
 * order for a printed sheet.
 */
export const scanAllPixels = (pixels: Uint8Array, width: number, height: number): ScanResult[] => {
  const dark = binarize(pixels, width, height);
  const locations = groupFinders(findFinders(dark, width, height));
  const results: ScanResult[] = [];
  for (const location of locations) {
    try {
      results.push(decodeLocation(dark, width, height, location));
    } catch {
      // A group that looked like a symbol but will not decode is skipped
      // rather than failing the whole scan: the other codes are still valid.
    }
  }
  return results.sort((a, b) => a.origin.y - b.origin.y || a.origin.x - b.origin.x);
};

/**
 * Locate and decode a QR symbol in an RGBA pixel buffer.
 *
 * @param pixels Row-major RGBA, `width * height * 4`.
 * @throws {NotFoundError} when no symbol can be located.
 * @throws {UncorrectableError} when a symbol is found but too damaged to read.
 */
export const scanPixels = (pixels: Uint8Array, width: number, height: number): ScanResult => {
  const dark = binarize(pixels, width, height);
  const finders = findFinders(dark, width, height);
  if (finders.length < 3) {
    throw new NotFoundError(
      `Found ${finders.length} finder pattern${finders.length === 1 ? '' : 's'}, need 3`,
    );
  }

  const locations = groupFinders(finders);
  if (locations.length === 0) {
    throw new NotFoundError(
      `Found ${finders.length} finder patterns, but none form a valid symbol`,
    );
  }

  let lastError: unknown = null;
  for (const location of locations) {
    try {
      return decodeLocation(dark, width, height, location);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new NotFoundError();
};

export { UncorrectableError };
