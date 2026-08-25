/**
 * Turning pixels into black and white.
 *
 * This is the step that decides whether a photograph scans, and the one it is
 * easiest to under-build. A single threshold for the whole image is exact for
 * anything this library renders — the pixels are either the body colour or the
 * background — and it holds for a photograph under flat, even light. It fails
 * on the things real photographs actually have: a shadow across one corner,
 * glare on a laminated card, a window lighting one side of the page more than
 * the other. In every one of those the *local* contrast is fine and the global
 * histogram is bimodal in the wrong place, so a global threshold reads one half
 * of the symbol as all-dark or all-light and no amount of Reed-Solomon will
 * recover it.
 *
 * So the default is local: the image is divided into blocks, each block gets a
 * threshold from its own neighbourhood, and a block with no real contrast of
 * its own inherits from its neighbours rather than inventing an edge inside
 * what is actually flat paper.
 */

/** How wide a threshold block is, in pixels. */
const BLOCK = 8;
const BLOCK_SHIFT = 3;

/**
 * Least spread between a block's lightest and darkest pixel for its own
 * histogram to be worth trusting.
 *
 * Below this the block is flat — all quiet zone, all paper, or the middle of a
 * wide dark module — and thresholding it on its own average would slice noise
 * straight down the middle and produce speckle where there is no edge at all.
 */
const MIN_DYNAMIC_RANGE = 24;

/** Smallest image worth thresholding locally, in pixels per side. */
const MIN_LOCAL_SIZE = BLOCK * 5;

/** Composite RGBA over white, then convert to luminance. */
export const toGray = (pixels: Uint8Array, width: number, height: number): Uint8Array => {
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

/**
 * Otsu's method: choose the threshold that minimises intra-class variance.
 *
 * A fixed mid-grey threshold breaks on the low-contrast and inverted styles
 * this library deliberately allows, so the threshold is derived from the
 * image's own histogram instead.
 */
export const otsuThreshold = (gray: Uint8Array): number => {
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

/** Threshold every pixel against one value. */
const applyGlobal = (gray: Uint8Array, threshold: number): Uint8Array => {
  const dark = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] <= threshold ? 1 : 0;
  return dark;
};

/**
 * How far outside its own block each block looks when measuring contrast.
 *
 * This exists because of a trap that is invisible on photographs and fatal on
 * rendered output. Sampling only the block itself works when module size and
 * block size are unrelated, which is true of a camera capture — modules land
 * at fractional sizes and arbitrary offsets, so a block almost always straddles
 * an edge. It is emphatically not true of an image this library rendered: at
 * `scale: 8` every module is exactly eight pixels and lands exactly on one
 * block, so *every* block is uniform, no block ever reports contrast, and the
 * whole local pass quietly degrades to the global threshold it was meant to
 * replace.
 *
 * Measuring over a window wider than the block fixes it: a module-aligned block
 * still sees its neighbours, so an edge four pixels away is enough.
 */
const SAMPLE_MARGIN = 4;

/**
 * Each block's own threshold, and whether that threshold means anything.
 *
 * A block with an edge near it is thresholded on the mean of what it can see.
 * A flat one is not thresholded at all here, only marked — it has no edge, so
 * any value derived from its own pixels is a guess, and the fill pass is a
 * better place to guess because it can look in every direction.
 */
const blockThresholds = (
  gray: Uint8Array,
  width: number,
  height: number,
  blocksAcross: number,
  blocksDown: number,
): { thresholds: Float32Array; known: Uint8Array; contrasted: number } => {
  const thresholds = new Float32Array(blocksAcross * blocksDown);
  const known = new Uint8Array(blocksAcross * blocksDown);
  let contrasted = 0;

  for (let by = 0; by < blocksDown; by++) {
    // The last row and column of blocks are pulled back inside the image
    // rather than being made narrower, so every block sees a full sample.
    const top = Math.min(by << BLOCK_SHIFT, height - BLOCK);
    const y0 = Math.max(0, top - SAMPLE_MARGIN);
    const y1 = Math.min(height - 1, top + BLOCK - 1 + SAMPLE_MARGIN);

    for (let bx = 0; bx < blocksAcross; bx++) {
      const left = Math.min(bx << BLOCK_SHIFT, width - BLOCK);
      const x0 = Math.max(0, left - SAMPLE_MARGIN);
      const x1 = Math.min(width - 1, left + BLOCK - 1 + SAMPLE_MARGIN);

      let min = 255;
      let max = 0;
      for (let y = y0; y <= y1; y++) {
        const row = y * width;
        for (let x = x0; x <= x1; x++) {
          const value = gray[row + x];
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }

      const index = by * blocksAcross + bx;
      if (max - min > MIN_DYNAMIC_RANGE) {
        // The midpoint of the range, not the mean of the samples. The mean is
        // pulled towards whichever of ink and paper covers more of the window,
        // which near a symbol's edge is the quiet zone — and a threshold
        // dragged towards the paper reads thin ink as light.
        thresholds[index] = (min + max) / 2;
        known[index] = 1;
        contrasted++;
      }
    }
  }

  return { thresholds, known, contrasted };
};

/** Mean of the blocks with a real threshold within `radius` of one block. */
const nearbyMean = (
  thresholds: Float32Array,
  known: Uint8Array,
  blocksAcross: number,
  blocksDown: number,
  bx: number,
  by: number,
  radius: number,
): number | null => {
  let sum = 0;
  let count = 0;
  const y0 = Math.max(0, by - radius);
  const y1 = Math.min(blocksDown - 1, by + radius);
  const x0 = Math.max(0, bx - radius);
  const x1 = Math.min(blocksAcross - 1, bx + radius);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * blocksAcross + x;
      if (!known[index]) continue;
      sum += thresholds[index];
      count++;
    }
  }
  return count === 0 ? null : sum / count;
};

/**
 * Threshold locally, taking each block's value from the contrasted blocks
 * around it.
 *
 * Two things are going on, and both matter.
 *
 * **Only contrasted blocks vote.** A flat block has no edge, so averaging its
 * guessed value in would pull real thresholds towards a number that came from
 * nowhere. Skipping it means a run of flat blocks — the inside of a wide dark
 * module, or a stretch of quiet zone — inherits from the nearest real edge
 * instead of inventing one.
 *
 * **The window is symmetric.** An earlier version propagated from the block
 * above and to the left, in raster order, which is what most implementations
 * of this do. That is a bias, and it shows: with glare on the *left* the
 * symbol read fine and with the same glare on the *right* it did not, because
 * flat blocks on the bright side were inheriting thresholds carried over from
 * the dark side. Looking in every direction removes the asymmetry entirely.
 *
 * Averaging across the neighbourhood rather than using each block's own value
 * is what keeps a seam from appearing down the middle of a module where two
 * adjacent blocks happened to land on slightly different averages.
 */
const applyLocal = (
  gray: Uint8Array,
  width: number,
  height: number,
  blocksAcross: number,
  blocksDown: number,
  thresholds: Float32Array,
  known: Uint8Array,
  fallback: () => number,
): Uint8Array => {
  const dark = new Uint8Array(gray.length);

  // Deferred, and computed at most once. The fallback is only reached by a
  // block with no contrasted neighbour inside either radius, which most images
  // never have — and computing it eagerly meant a full 256-bin histogram over
  // every pixel on every pass, for a number that was usually discarded.
  let fallbackValue = -1;
  const globalThreshold = () => {
    if (fallbackValue < 0) fallbackValue = fallback();
    return fallbackValue;
  };

  for (let by = 0; by < blocksDown; by++) {
    const top = Math.min(by << BLOCK_SHIFT, height - BLOCK);
    for (let bx = 0; bx < blocksAcross; bx++) {
      const left = Math.min(bx << BLOCK_SHIFT, width - BLOCK);

      // Two radii before giving up: a tight neighbourhood tracks the lighting
      // closely, and a wider one still beats a global answer for a block in
      // the middle of a large blank area.
      const threshold =
        nearbyMean(thresholds, known, blocksAcross, blocksDown, bx, by, 2) ??
        nearbyMean(thresholds, known, blocksAcross, blocksDown, bx, by, 5) ??
        globalThreshold();

      for (let y = 0; y < BLOCK; y++) {
        const row = (top + y) * width;
        for (let x = 0; x < BLOCK; x++) {
          dark[row + left + x] = gray[row + left + x] <= threshold ? 1 : 0;
        }
      }
    }
  }

  return dark;
};

export interface BinarizeOptions {
  /**
   * Force one threshold for the whole image.
   *
   * The local threshold is strictly better on a photograph and no worse on
   * rendered output, so this exists for cases where a caller knows the
   * lighting is flat and wants the cheaper pass, and for comparing the two.
   */
  global?: boolean;
}

/**
 * Binarise an image once, so multi-symbol scanning does not repeat the work.
 *
 * Local by default. Images smaller than five blocks a side fall back to a
 * global threshold: there is not enough of them for a neighbourhood to mean
 * anything, and a 40-pixel image is a rendered thumbnail rather than a
 * photograph.
 */
export const binarize = (
  pixels: Uint8Array,
  width: number,
  height: number,
  options: BinarizeOptions = {},
): Uint8Array => binarizeGray(toGray(pixels, width, height), width, height, options);

/**
 * Binarise an image whose luminance has already been computed.
 *
 * The scanner thresholds the same frame both locally and globally before it
 * gives up, and converting to luminance is identical work both times — a full
 * pass over every pixel, doing an alpha composite and a weighted sum, to
 * produce a buffer it already had.
 */
export const binarizeGray = (
  gray: Uint8Array,
  width: number,
  height: number,
  options: BinarizeOptions = {},
): Uint8Array => {
  if (options.global || width < MIN_LOCAL_SIZE || height < MIN_LOCAL_SIZE) {
    return applyGlobal(gray, otsuThreshold(gray));
  }

  const blocksAcross = Math.ceil(width / BLOCK);
  const blocksDown = Math.ceil(height / BLOCK);
  const { thresholds, known, contrasted } = blockThresholds(
    gray,
    width,
    height,
    blocksAcross,
    blocksDown,
  );

  // An image with no contrasted block anywhere has no symbol in it, so answer
  // globally: without this, every block searches its neighbourhood twice and
  // finds nothing both times. Worth about a millisecond on a blank 640x480
  // frame, which is a path that runs ten times a second behind the camera hook.
  if (contrasted === 0) return applyGlobal(gray, otsuThreshold(gray));

  // The global threshold is still passed in as the last resort for a block
  // that has no contrasted neighbour within either radius — an isolated blank
  // region in an image that does have content elsewhere.
  return applyLocal(gray, width, height, blocksAcross, blocksDown, thresholds, known, () =>
    otsuThreshold(gray),
  );
};
