/**
 * Locating Micro QR and rMQR symbols in an image.
 *
 * A QR symbol gives a detector three finder patterns, and three points fix
 * position, scale *and* rotation outright. Neither compact symbology does.
 * Micro QR has one finder; rMQR has one finder plus a 5x5 sub-finder in the
 * opposite corner. A single 7x7 finder is rotationally symmetric, so it fixes
 * position and scale and says nothing at all about which way up the symbol is.
 *
 * What it does give away is its own square outline. The corners of the outer
 * dark ring sit at 45 degrees to the symbol's axes, so measuring how far that
 * ring reaches in every direction recovers the rotation **modulo 90 degrees**
 * — the symbol is one of four quarter turns, and which one is unknown.
 *
 * From there this searches rather than derives: build a candidate grid for
 * each quarter turn and each size the symbology defines, and keep the first
 * that decodes. That is 16 attempts for Micro QR and 128 for rMQR, on grids of
 * at most 17x139 modules, and every one is validated by format information and
 * Reed-Solomon before it is believed. Deriving the orientation from the timing
 * patterns instead would be tighter, but it would also be a second, subtler
 * piece of geometry to get wrong — and the search is bounded, cheap, and
 * cannot return a symbol that does not actually decode.
 *
 * ### Scope
 * Rotation and scale, not perspective. Both symbologies are located under a
 * similarity transform, so a rotated capture reads and a strongly tilted one
 * does not. Full QR is the one that gets perspective correction, because it is
 * the one with enough correspondences to fit a homography.
 */

import { MICRO_VERSIONS, type MicroVersion, microSize } from '../core/micro.js';
import { RMQR_SPECS, RMQR_VERSIONS, type RmqrVersion } from '../core/rmqr.js';
import { decodeMicroMatrix } from './decode-micro.js';
import { decodeRmqrMatrix } from './decode-rmqr.js';
import { type Candidate, findRingCentres, runLengthTowards } from './finder.js';
import { type PerspectiveTransform, sampleGrid, transformPoint } from './perspective.js';
import type { ScanResult } from './scan.js';

/**
 * The rotation of a finder pattern, modulo a quarter turn.
 *
 * A square's corners lie at 45 degrees to its edges, so the direction in which
 * the finder's outer ring reaches furthest gives the symbol's axes — but only
 * to within a quarter turn, because all four corners look alike.
 *
 * Returns `null` when the outline does not behave like a finder's.
 */
export const finderAngle = (
  dark: Uint8Array,
  width: number,
  height: number,
  finder: Candidate,
): number | null => {
  const { x: cx, y: cy, size } = finder;

  // Sweep rays out from the centre and measure where each leaves the finder,
  // rather than hunting for the farthest dark pixel nearby. The difference
  // matters: a data module two rings out is dark and further away than any
  // part of the finder, so "farthest dark pixel" answers with the data region
  // and the orientation is wrong by tens of degrees. `runLengthTowards` stops
  // at the far edge of the outer ring instead — 3.5 modules along an axis,
  // 3.5 * sqrt(2) at a corner.
  //
  // The angle then comes from the *fourth* angular harmonic of that profile,
  // not from whichever single ray reached furthest. A square's radius has
  // period 90 degrees, so every ray is evidence about the same orientation and
  // summing them averages away the noise in each; an argmax is only ever as
  // precise as the sweep is fine. Precision is what matters here rather than
  // robustness: one degree of error is a third of a module across a Micro QR
  // symbol and nearly three across the widest rMQR, which is the difference
  // between reading it and not.
  const steps = 360;
  const reach = size * 6;
  let real = 0;
  let imaginary = 0;
  let samples = 0;
  let furthest = 0;

  for (let i = 0; i < steps; i++) {
    const theta = (i * 2 * Math.PI) / steps;
    const distance = runLengthTowards(
      dark,
      width,
      height,
      cx,
      cy,
      cx + Math.cos(theta) * reach,
      cy + Math.sin(theta) * reach,
    );
    if (!Number.isFinite(distance)) continue;
    // Anything past the ring's own corner belongs to something else.
    if (distance > size * 5.2) continue;
    if (distance > furthest) furthest = distance;
    real += distance * Math.cos(4 * theta);
    imaginary += distance * Math.sin(4 * theta);
    samples++;
  }

  // A ring corner should be measurably further than a ring edge; if nothing
  // stood out, this is not a finder pattern.
  if (samples < steps / 2 || furthest < size * 3.2) return null;

  // The harmonic peaks at the corners, which sit 45 degrees off the axes.
  const quarter = Math.PI / 2;
  const corner = Math.atan2(imaginary, real) / 4;
  return (((corner - Math.PI / 4) % quarter) + quarter) % quarter;
};

/**
 * An affine transform placing a grid of `pitch`-wide modules at `angle`, with
 * the finder centre — grid coordinate (3.5, 3.5) in every symbology here —
 * pinned to a known image point.
 */
const gridTransform = (
  finderX: number,
  finderY: number,
  pitch: number,
  angle: number,
): PerspectiveTransform => {
  const ax = Math.cos(angle) * pitch;
  const ay = Math.sin(angle) * pitch;
  // The y axis is the x axis turned a quarter turn, which keeps the grid
  // square: these symbologies are never sheared, only rotated and scaled.
  const bx = -ay;
  const by = ax;
  return {
    a11: ax,
    a12: ay,
    a13: 0,
    a21: bx,
    a22: by,
    a23: 0,
    a31: finderX - 3.5 * ax - 3.5 * bx,
    a32: finderY - 3.5 * ay - 3.5 * by,
    a33: 1,
  };
};

/** The four quarter turns of a base angle. */
const quarterTurns = (base: number): number[] => [
  base,
  base + Math.PI / 2,
  base + Math.PI,
  base + (3 * Math.PI) / 2,
];

/**
 * Try to read a Micro QR symbol centred on a finder candidate.
 *
 * Returns `null` rather than throwing: a finder that turns out not to head a
 * Micro QR symbol is an ordinary outcome when several symbologies are being
 * tried against the same image.
 */
export const readMicroAt = (
  dark: Uint8Array,
  width: number,
  height: number,
  finder: Candidate,
): ScanResult | null => {
  const base = finderAngle(dark, width, height, finder);
  if (base === null) return null;

  for (const angle of quarterTurns(base)) {
    const transform = gridTransform(finder.x, finder.y, finder.size, angle);
    for (const version of MICRO_VERSIONS) {
      const size = microSize(version);
      const modules = sampleGrid(dark, width, height, size, size, transform);
      // Off the edge of the image means this size cannot be right, but a
      // larger one is only worse, so stop rather than continue.
      if (!modules) break;
      try {
        const result = decodeMicroMatrix({ size, modules });
        return {
          ...result,
          version: MICRO_VERSIONS.indexOf(result.version) + 1,
          segments: result.segments,
          mask: result.mask,
          moduleSize: finder.size,
          origin: transformPoint(transform, 0, 0),
        };
      } catch {
        // Wrong size or wrong quarter turn; keep trying.
      }
    }
  }
  return null;
};

/**
 * A transform pinned to two known points rather than one point and an angle.
 *
 * `from`/`to` are grid coordinates and `a`/`b` the image points they land on.
 * Scale and rotation both fall out of the vector between them, which is the
 * reason to bother: an angle measured across a 7-module finder and applied to
 * a 139-module symbol multiplies its own error by twenty, whereas the same
 * quantities measured end to end across the symbol do not.
 */
const twoPointTransform = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): PerspectiveTransform => {
  const gridX = to.x - from.x;
  const gridY = to.y - from.y;
  const imageX = b.x - a.x;
  const imageY = b.y - a.y;

  const gridLength = Math.hypot(gridX, gridY);
  const pitch = Math.hypot(imageX, imageY) / gridLength;
  const angle = Math.atan2(imageY, imageX) - Math.atan2(gridY, gridX);

  const ax = Math.cos(angle) * pitch;
  const ay = Math.sin(angle) * pitch;
  return {
    a11: ax,
    a12: ay,
    a13: 0,
    a21: -ay,
    a22: ax,
    a23: 0,
    a31: a.x - from.x * ax + from.y * ay,
    a32: a.y - from.x * ay - from.y * ax,
    a33: 1,
  };
};

/**
 * Try to read an rMQR symbol whose 7x7 finder is the given candidate.
 *
 * Two passes per size. The first places the grid from the finder alone, which
 * is enough to predict roughly where the 5x5 sub-finder in the opposite corner
 * should be. If that sub-finder is actually there, the grid is rebuilt from
 * the two of them — and *that* is the fit worth having, because the two points
 * sit at opposite ends of the symbol, so scale and rotation are measured over
 * its full diagonal instead of across seven modules of finder.
 *
 * Sizes are tried largest-first so a wide symbol is not mistaken for the
 * narrow one nested inside its own top-left corner: a grid that samples only
 * part of a symbol can still satisfy its own format information if the
 * fragment happens to line up, and the first plausible answer wins.
 */
export const readRmqrAt = (
  dark: Uint8Array,
  width: number,
  height: number,
  finder: Candidate,
): ScanResult | null => {
  const base = finderAngle(dark, width, height, finder);
  if (base === null) return null;

  const bySizeDescending = [...RMQR_VERSIONS].sort(
    (a, b) =>
      RMQR_SPECS[b].width * RMQR_SPECS[b].height - RMQR_SPECS[a].width * RMQR_SPECS[a].height,
  );

  const finderGrid = { x: 3.5, y: 3.5 };
  const finderImage = { x: finder.x, y: finder.y };

  for (const angle of quarterTurns(base)) {
    const coarse = gridTransform(finder.x, finder.y, finder.size, angle);

    for (const version of bySizeDescending) {
      const spec = RMQR_SPECS[version];
      // The sub-finder's own dark centre module sits three in from each far
      // edge, so its grid centre is (width - 2.5, height - 2.5).
      const subGrid = { x: spec.width - 2.5, y: spec.height - 2.5 };
      const predicted = transformPoint(coarse, subGrid.x, subGrid.y);

      const fits: PerspectiveTransform[] = [];
      if (predicted.x >= 0 && predicted.y >= 0 && predicted.x < width && predicted.y < height) {
        // The sub-finder reads light-dark-light through its middle, exactly
        // like an alignment pattern, so the same detector finds it.
        for (const centre of findRingCentres(
          dark,
          width,
          height,
          predicted.x,
          predicted.y,
          finder.size,
        )) {
          fits.push(twoPointTransform(finderGrid, subGrid, finderImage, centre));
        }
      }
      // The finder-only fit stays as the fallback, so a symbol whose
      // sub-finder is damaged or obscured still reads.
      fits.push(coarse);

      for (const transform of fits) {
        const modules = sampleGrid(dark, width, height, spec.width, spec.height, transform);
        if (!modules) continue;
        try {
          const result = decodeRmqrMatrix({ modules, width: spec.width, height: spec.height });
          return {
            ...result,
            version: RMQR_VERSIONS.indexOf(result.version) + 1,
            ecc: result.ecc,
            mask: 0,
            moduleSize: finder.size,
            origin: transformPoint(transform, 0, 0),
          };
        } catch {
          // Wrong size, wrong quarter turn, or a sub-finder that was not one.
        }
      }
    }
  }
  return null;
};

/**
 * Read whichever compact symbology a finder heads, if either.
 *
 * rMQR is tried first. Its format information is 18 bits written twice, which
 * is a far stronger check than Micro QR's single 15-bit copy, so trying it
 * first means the stricter test gets to rule on the symbol before the looser
 * one can claim it.
 */
export const readCompactAt = (
  dark: Uint8Array,
  width: number,
  height: number,
  finder: Candidate,
): ScanResult | null =>
  readRmqrAt(dark, width, height, finder) ?? readMicroAt(dark, width, height, finder);

export type { MicroVersion, RmqrVersion };
