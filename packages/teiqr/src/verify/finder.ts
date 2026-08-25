/**
 * Finding finder patterns, and measuring against them.
 *
 * Split out from the scanner because both the QR path and the compact
 * symbologies need these primitives, and having the compact locator import
 * from the scanner that calls it would make the two modules circular.
 *
 * Everything here works on a binarised image and knows nothing about which
 * symbology it is serving.
 */

/** A located finder-pattern centre, with the module pitch measured at it. */
export interface Candidate {
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
export const findFinders = (dark: Uint8Array, width: number, height: number): Candidate[] => {
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

/**
 * Length of the black-white-black run starting at a finder centre and walking
 * towards another point, in pixels.
 *
 * Walking outwards from the centre of a finder crosses 1.5 modules of its dark
 * core, then 1 of the light ring, then 1 of the dark ring — 3.5 modules,
 * measured *in the direction of travel*. That last part is the point: module
 * pitch is not the same horizontally and vertically once a symbol is tilted,
 * so a size measured across a row cannot be used to count modules down a
 * column.
 *
 * Bresenham rather than floating-point stepping, so the walk visits exactly
 * the pixels a line would and cannot skip a thin ring.
 */
export const runLengthTowards = (
  dark: Uint8Array,
  width: number,
  height: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number => {
  let x0 = Math.round(fromX);
  let y0 = Math.round(fromY);
  let x1 = Math.round(toX);
  let y1 = Math.round(toY);

  // Bresenham is written for shallow lines; steep ones are walked with the
  // axes swapped and swapped back when sampling.
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) {
    [x0, y0] = [y0, x0];
    [x1, y1] = [y1, x1];
  }

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const xStep = x0 < x1 ? 1 : -1;
  const yStep = y0 < y1 ? 1 : -1;
  let error = -dx / 2;
  let state = 0;
  let y = y0;

  for (let x = x0; x !== x1 + xStep; x += xStep) {
    const realX = steep ? y : x;
    const realY = steep ? x : y;
    const isDark =
      realX >= 0 && realY >= 0 && realX < width && realY < height
        ? dark[realY * width + realX] === 1
        : false;

    // state 0: inside the dark core. 1: crossing the light ring. 2: inside
    // the dark ring, and the next light pixel ends the measurement.
    if ((state === 1) === isDark) {
      if (state === 2) return Math.hypot(x - x0, y - y0);
      state++;
    }

    error += dy;
    if (error > 0) {
      if (y === y1) break;
      y += yStep;
      error -= dx;
    }
  }

  // Ran to the end still inside the dark ring: the far edge is as good an
  // answer as we can give. Anything earlier means the pattern was not there.
  return state === 2 ? Math.hypot(x1 + xStep - x0, y1 - y0) : Number.NaN;
};

/**
 * Module pitch along the line joining two finder centres.
 *
 * Measured from both ends and in both directions — four half-runs of 3.5
 * modules each, so fourteen modules in total — which averages out the error
 * from either finder individually.
 */
export const pitchBetween = (
  dark: Uint8Array,
  width: number,
  height: number,
  a: Candidate,
  b: Candidate,
): number => {
  const bothWays = (from: Candidate, to: Candidate): number => {
    const forward = runLengthTowards(dark, width, height, from.x, from.y, to.x, to.y);
    // The same run in the opposite direction, by reflecting the target through
    // the origin. Together they span the finder's full 7 modules.
    const backward = runLengthTowards(
      dark,
      width,
      height,
      from.x,
      from.y,
      2 * from.x - to.x,
      2 * from.y - to.y,
    );
    // Less one, for the centre pixel both halves counted.
    return forward + backward - 1;
  };

  const first = bothWays(a, b);
  const second = bothWays(b, a);
  const usable = [first, second].filter((value) => Number.isFinite(value));
  if (usable.length === 0) return (a.size + b.size) / 2;
  return usable.reduce((sum, value) => sum + value, 0) / (usable.length * 7);
};
