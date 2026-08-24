import type { EyeBallShape, EyeFrameShape, ModuleShape, QrStyle } from './types.js';

/**
 * How much detection margin each decorative shape actually costs.
 *
 * Every shape here renders every module the matrix marks dark — that is
 * enforced by test, and the rasteriser is verified pixel-exact for square
 * modules. What varies is how much of each module's *area* survives the
 * styling, and detectors care about area.
 *
 * ZXing-family decoders verify a finder pattern by scanning its 1:1:3:1:1
 * ratio horizontally, vertically, *and diagonally*. A circular eye core
 * measures 3.0 across its diagonal where a square measures 4.24, so the
 * diagonal check fails. Newer camera stacks use ML detection and tolerate it,
 * which is why these shapes look fine on a modern phone and fail on older
 * scanners and cheap hardware.
 *
 * ### These tiers are measured, not guessed
 * Each variant was rendered and decoded with jsQR (a ZXing-derived decoder)
 * across 3 payloads x 4 error correction levels x 6 module scales — 72 decode
 * attempts each. `safe` means every attempt succeeded; `reduced` means at
 * least 90% did; `poor` is anything below that. The recorded pass rates are in
 * the comments beside each entry so the claim can be audited, and
 * `scripts/measure-safety.ts` regenerates the whole table.
 *
 * ### Scale matters as much as shape
 * Several shapes fail only in specific size bands, which is why a single
 * "supported/unsupported" flag would be misleading. Detached shapes
 * (`dot`, `diamond`, `star`) are the clearest case: at small scales
 * anti-aliasing bleeds neighbouring modules together and they read fine, while
 * at 8 px and above the gaps become real and the decoder loses the grid.
 * That is the opposite of the "bigger is safer" intuition, and it is why the
 * validator warns on shape rather than on output size.
 */
export type ScanSafety = 'safe' | 'reduced' | 'poor';

export const MODULE_SHAPE_SAFETY: Readonly<Record<ModuleShape, ScanSafety>> = {
  square: 'safe', //         72/72
  rounded: 'safe', //        72/72
  'extra-rounded': 'safe', // 72/72
  vertical: 'safe', //       72/72
  horizontal: 'safe', //     72/72
  fluid: 'safe', //          72/72
  dot: 'poor', //            61/72 — detached modules; worst around 10-12 px
  classy: 'poor', //         54/72 — half-module corner radii lose too much area
  diamond: 'poor', //        36/72 — fails consistently at 8 px and above
  star: 'poor', //           36/72 — as diamond
};

export const EYE_FRAME_SAFETY: Readonly<Record<EyeFrameShape, ScanSafety>> = {
  square: 'safe', //   72/72
  rounded: 'safe', //  72/72
  cut: 'safe', //      72/72
  dotted: 'reduced', // 68/72 — only fails at the smallest scales
  leaf: 'poor', //     49/72 — breaks the diagonal 1:1:3:1:1 check
  circle: 'poor', //   42/72 — as leaf, more severely
};

export const EYE_BALL_SAFETY: Readonly<Record<EyeBallShape, ScanSafety>> = {
  square: 'safe', //   72/72
  rounded: 'reduced', // 67/72
  leaf: 'poor', //     35/72
  dot: 'poor', //      37/72
  diamond: 'poor', //   9/72 — effectively unusable with ZXing-derived readers
};

const RANK: Readonly<Record<ScanSafety, number>> = { safe: 0, reduced: 1, poor: 2 };

const worst = (a: ScanSafety, b: ScanSafety): ScanSafety => (RANK[a] >= RANK[b] ? a : b);

/** The weakest link across the three shape choices. */
export const styleSafety = (
  style: Pick<QrStyle, 'moduleShape' | 'eyeFrame' | 'eyeBall'>,
): ScanSafety =>
  worst(
    MODULE_SHAPE_SAFETY[style.moduleShape],
    worst(EYE_FRAME_SAFETY[style.eyeFrame], EYE_BALL_SAFETY[style.eyeBall]),
  );

export const SAFETY_NOTE: Readonly<Record<ScanSafety, string>> = {
  safe: 'Decoded on every one of 72 measured attempts across payloads, error correction levels and sizes.',
  reduced:
    'Decoded on at least 90% of measured attempts. Reads on modern phone cameras, but older and ZXing-based scanners may struggle. Raise error correction to Q or H if this code will be printed, and test at the size you will actually use.',
  poor: 'Failed a significant share of measured decode attempts with a ZXing-derived reader. Use only where you control the scanning device, and test before printing — some of these shapes fail at large sizes and succeed at small ones, so a preview at one scale proves nothing.',
};

/**
 * Pass rates behind the tiers above, as `decoded / attempted`. Exposed so a
 * UI can show the evidence rather than just the verdict.
 */
export const SAFETY_EVIDENCE: Readonly<Record<string, readonly [number, number]>> = {
  'module:square': [72, 72],
  'module:rounded': [72, 72],
  'module:extra-rounded': [72, 72],
  'module:vertical': [72, 72],
  'module:horizontal': [72, 72],
  'module:fluid': [72, 72],
  'module:dot': [61, 72],
  'module:classy': [54, 72],
  'module:diamond': [36, 72],
  'module:star': [36, 72],
  'frame:square': [72, 72],
  'frame:rounded': [72, 72],
  'frame:cut': [72, 72],
  'frame:dotted': [68, 72],
  'frame:leaf': [49, 72],
  'frame:circle': [42, 72],
  'ball:square': [72, 72],
  'ball:rounded': [67, 72],
  'ball:dot': [37, 72],
  'ball:leaf': [35, 72],
  'ball:diamond': [9, 72],
};
