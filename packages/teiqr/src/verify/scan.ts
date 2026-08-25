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
 * The grid is read through a fitted perspective transform, so a rotated or
 * off-axis capture decodes rather than drifting off the modules partway
 * across, and thresholding is local rather than global, so uneven lighting
 * does not take half the symbol with it. See `binarize.ts` for the latter.
 */

import { functionPatternKinds } from '../core/matrix.js';
import { MAX_VERSION, MIN_VERSION, sizeForVersion } from '../core/version.js';
import { binarize } from './binarize.js';
import { type DecodeResult, decodeMatrix } from './decode-matrix.js';
import { type Candidate, findFinders, findRingCentres, pitchBetween } from './finder.js';
import { readCompactAt } from './locate-compact.js';
import { quadrilateralToQuadrilateral, sampleGrid, transformPoint } from './perspective.js';
import { UncorrectableError } from './reed-solomon.js';

/** Raised when no symbol could be located in the image. */
export class NotFoundError extends Error {
  constructor(message = 'No QR symbol found in the image') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Three finder patterns that together describe one symbol. */
export interface SymbolLocation {
  readonly topLeft: Candidate;
  readonly topRight: Candidate;
  readonly bottomLeft: Candidate;
  readonly moduleSize: number;
}

/**
 * How far a finder triple may stray from a perfect right isosceles triangle.
 *
 * Flat, the three finders of a QR symbol sit at the corners of one exactly:
 * two equal legs from the top-left, and a hypotenuse sqrt(2) times as long.
 * Perspective breaks that — it preserves straight lines but not ratios — so
 * the test has to be loose enough to admit a tilted symbol and tight enough
 * that three finders belonging to *different* codes are not mistaken for one.
 *
 * 35% admits tilts well past what stays readable for other reasons, and
 * candidates are still scored and taken best-first, so a flat symbol claims
 * its own finders before a looser accidental arrangement can reach them.
 * Anything that slips through is caught by the decode, which is the real
 * filter: a mis-grouped triple fails Reed-Solomon rather than returning text.
 */
const SHAPE_TOLERANCE = 0.35;

/**
 * Group finder candidates into symbols.
 *
 * An image can hold several codes, so picking the two furthest-apart finders
 * and calling the rest one symbol — which is what a single-code decoder does —
 * produces nonsense the moment there is more than one. Instead every triple of
 * similarly-sized candidates is tested for the arrangement the three finders
 * of a QR symbol form, within {@link SHAPE_TOLERANCE}.
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
        // Finders of one symbol are close to the same size. Perspective
        // shrinks the far one, so this is looser than exact equality.
        if (Math.max(...sizes) > Math.min(...sizes) * 2) continue;

        for (const corner of trio) {
          const [a, b] = trio.filter((f) => f !== corner);
          const legA = dist(corner, a);
          const legB = dist(corner, b);
          const hyp = dist(a, b);
          if (legA === 0 || legB === 0) continue;
          if (Math.abs(legA - legB) > Math.max(legA, legB) * SHAPE_TOLERANCE) continue;
          const expected = ((legA + legB) / 2) * Math.SQRT2;
          if (Math.abs(hyp - expected) > expected * SHAPE_TOLERANCE) continue;

          // Shape alone is not enough to rank a triple, and a real photograph
          // is what proves it. Data areas throw up finder-shaped false
          // positives, and one of them can sit in a *more* perfect right angle
          // than the true corner does — the true one having been nudged by
          // perspective. Scored on geometry only, the impostor wins, claims
          // the finders greedily, and the genuine triple can never form.
          //
          // Measured on a photo of a code on a laptop screen: the false triple
          // scored 0.036 against the true triple's 0.058 and took it. Their
          // module sizes were 21.7/33.4/21.1 against 21.1/21.7/19.6, which is
          // the tell — three finders of one symbol are near enough the same
          // size, and the 2x gate above is far too loose to express that.
          const spread = (Math.max(...sizes) - Math.min(...sizes)) / Math.max(...sizes);
          const score =
            Math.abs(legA - legB) / Math.max(legA, legB) +
            Math.abs(hyp - expected) / expected +
            spread;
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
 * Modules across, derived from how many module widths separate the finder
 * centres.
 *
 * Both spans are measured and averaged, because under perspective one of them
 * is foreshortened and the other is not. The result is then snapped to the
 * nearest legal size: every QR symbol is 4v + 17 modules, so a dimension
 * congruent to 0 or 2 mod 4 is off by one and a dimension congruent to 3 is
 * not recoverable and means the location is wrong.
 */
const computeDimension = (
  dark: Uint8Array,
  width: number,
  height: number,
  location: SymbolLocation,
): { dimension: number; pitch: number } => {
  const { topLeft, topRight, bottomLeft } = location;
  // Each edge is counted against pitch measured along that edge. Using one
  // figure for the whole symbol leaves the horizontal and vertical errors to
  // compound, which is enough to land on a dimension that is not 4v + 17 at
  // all — and then the symbol is rejected rather than merely mis-sampled.
  const pitchTop = pitchBetween(dark, width, height, topLeft, topRight);
  const pitchLeft = pitchBetween(dark, width, height, topLeft, bottomLeft);
  const across = Math.round(Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) / pitchTop);
  const down = Math.round(
    Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) / pitchLeft,
  );

  let dimension = Math.round((across + down) / 2) + 7;
  switch (dimension & 3) {
    case 0:
      dimension++;
      break;
    case 2:
      dimension--;
      break;
    case 3:
      throw new NotFoundError(`Derived an implausible symbol size: ${dimension} modules`);
  }
  return { dimension, pitch: (pitchTop + pitchLeft) / 2 };
};

/**
 * How much of the timing pattern a sampled grid gets right, as a fraction.
 *
 * Row 6 and column 6 alternate dark and light between the finder patterns, and
 * which modules are dark is fixed by the position alone — no version, level or
 * mask enters into it. That makes them a free, prior-known check on whether a
 * candidate transform actually lands on the modules: a correct fit scores 1,
 * and a fit that has slipped by a module or landed on the wrong grid entirely
 * scores around a half, which is chance.
 */
const timingScore = (modules: Uint8Array, size: number): number => {
  let correct = 0;
  let total = 0;
  for (let i = 8; i < size - 8; i++) {
    const expected = i % 2 === 0 ? 1 : 0;
    if (modules[6 * size + i] === expected) correct++;
    if (modules[i * size + 6] === expected) correct++;
    total += 2;
  }
  return total === 0 ? 0 : correct / total;
};

/**
 * Sample and decode one located symbol out of a binarised image.
 *
 * The grid is read through a fitted perspective transform rather than a fixed
 * pitch, so a symbol photographed at an angle samples correctly across its
 * whole width instead of drifting off the modules partway.
 */
export const decodeLocation = (
  dark: Uint8Array,
  width: number,
  height: number,
  location: SymbolLocation,
): ScanResult => {
  const { topLeft, topRight, bottomLeft, moduleSize } = location;
  if (moduleSize <= 0) throw new NotFoundError('Degenerate module size');

  const { dimension, pitch } = computeDimension(dark, width, height, location);
  const version = (dimension - 17) / 4;
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new NotFoundError(`Derived an implausible symbol size: ${dimension} modules`);
  }

  const size = sizeForVersion(version);
  const far = dimension - 3.5;

  // Extrapolated fourth corner: exact for a flat symbol, and the fallback when
  // no alignment pattern can be found or trusted.
  const extrapolatedX = topRight.x - topLeft.x + bottomLeft.x;
  const extrapolatedY = topRight.y - topLeft.y + bottomLeft.y;

  const build = (cx: number, cy: number, sx: number, sy: number) =>
    quadrilateralToQuadrilateral(
      3.5,
      3.5,
      far,
      3.5,
      sx,
      sy,
      3.5,
      far,
      topLeft.x,
      topLeft.y,
      topRight.x,
      topRight.y,
      cx,
      cy,
      bottomLeft.x,
      bottomLeft.y,
    );

  // Candidate fits, always including the extrapolated corner so there is
  // something to fall back to.
  const fits = [build(extrapolatedX, extrapolatedY, far, far)];

  if (version >= 2) {
    // The alignment centre sits three modules in from the extrapolated corner.
    const pull = 1 - 3 / (dimension - 7);
    for (const candidate of findRingCentres(
      dark,
      width,
      height,
      topLeft.x + pull * (extrapolatedX - topLeft.x),
      topLeft.y + pull * (extrapolatedY - topLeft.y),
      pitch,
    )) {
      fits.push(build(candidate.x, candidate.y, far - 3, far - 3));
    }
  }

  // Choose between them by how well each reproduces the timing patterns.
  //
  // This is the step that makes alignment detection safe. Picking whichever
  // candidate lies nearest the estimate is not good enough, because the
  // estimate itself is the thing perspective has distorted — on a large tilted
  // symbol a chance light-dark-light run in the data can sit closer to it than
  // the real pattern. The timing rows are known a priori for every symbol, so
  // scoring against them asks the only question that matters: does this fit
  // actually land on the modules? A wrong candidate scores near chance.
  let modules: Uint8Array | null = null;
  let chosen = fits[0];
  let bestScore = -1;
  for (const fit of fits) {
    const grid = sampleGrid(dark, width, height, size, size, fit);
    if (!grid) continue;
    const score = timingScore(grid, size);
    if (score > bestScore) {
      bestScore = score;
      modules = grid;
      chosen = fit;
    }
    // A perfect fit cannot be improved on, so stop looking.
    if (bestScore === 1) break;
  }

  if (!modules) throw new NotFoundError('Symbol extends past the edge of the image');

  const kinds = functionPatternKinds(version);
  const result = decodeMatrix({ size, version, modules, kinds }, { trustHeader: false });
  const origin = transformPoint(chosen, 0, 0);
  return { ...result, moduleSize: pitch, origin };
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

/** Finders already claimed by a decoded QR symbol, so they are not re-read. */
const claimedBy = (locations: readonly SymbolLocation[]): Set<Candidate> => {
  const claimed = new Set<Candidate>();
  for (const location of locations) {
    claimed.add(location.topLeft);
    claimed.add(location.topRight);
    claimed.add(location.bottomLeft);
  }
  return claimed;
};

/**
 * Locate and decode every symbol in an RGBA pixel buffer.
 *
 * QR is read first, then any finder left over is offered to the compact
 * symbologies. The order matters: a QR symbol's three finders would each look
 * like a lone Micro QR finder on their own, so letting Micro QR see them
 * before QR has grouped them would produce three phantom symbols where there
 * is one real one.
 *
 * Returns them ordered top-to-bottom, then left-to-right, which is reading
 * order for a printed sheet.
 */
export const scanAllPixels = (pixels: Uint8Array, width: number, height: number): ScanResult[] => {
  const dark = binarize(pixels, width, height);
  const finders = findFinders(dark, width, height);
  const locations = groupFinders(finders);
  const results: ScanResult[] = [];
  const decoded: SymbolLocation[] = [];

  for (const location of locations) {
    try {
      results.push(decodeLocation(dark, width, height, location));
      decoded.push(location);
    } catch {
      // A group that looked like a symbol but will not decode is skipped
      // rather than failing the whole scan: the other codes are still valid.
    }
  }

  const claimed = claimedBy(decoded);
  for (const finder of finders) {
    if (claimed.has(finder)) continue;
    const compact = readCompactAt(dark, width, height, finder);
    if (compact) results.push(compact);
  }

  return results.sort((a, b) => a.origin.y - b.origin.y || a.origin.x - b.origin.x);
};

/**
 * Locate and decode a symbol in an RGBA pixel buffer.
 *
 * @param pixels Row-major RGBA, `width * height * 4`.
 * @throws {NotFoundError} when no symbol can be located.
 * @throws {UncorrectableError} when a symbol is found but too damaged to read.
 */
export const scanPixels = (pixels: Uint8Array, width: number, height: number): ScanResult => {
  const dark = binarize(pixels, width, height);
  const finders = findFinders(dark, width, height);
  if (finders.length === 0) {
    throw new NotFoundError('Found no finder patterns');
  }

  let lastError: unknown = null;
  for (const location of groupFinders(finders)) {
    try {
      return decodeLocation(dark, width, height, location);
    } catch (error) {
      lastError = error;
    }
  }

  // No QR symbol; a lone finder may still head a Micro QR or rMQR symbol.
  for (const finder of finders) {
    const compact = readCompactAt(dark, width, height, finder);
    if (compact) return compact;
  }

  throw (
    lastError ??
    new NotFoundError(
      `Found ${finders.length} finder pattern${finders.length === 1 ? '' : 's'}, but none form a readable symbol`,
    )
  );
};

export { type BinarizeOptions, binarize } from './binarize.js';
export { type Candidate, findFinders } from './finder.js';
export { UncorrectableError };
