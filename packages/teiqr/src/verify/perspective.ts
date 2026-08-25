/**
 * Perspective sampling.
 *
 * A symbol photographed off-axis is not a scaled rectangle, it is a
 * quadrilateral: the far edge is shorter than the near one, and module pitch
 * changes across the symbol. Sampling such an image on a fixed grid walks off
 * the modules somewhere in the middle, which is why "assumes the symbol is
 * axis-aligned" is the difference between reading rendered output and reading
 * a photograph.
 *
 * The fix is the standard one: fit a 3x3 homography from the module grid to
 * the image, then sample each module through it. Four point correspondences
 * determine the transform, and a QR symbol supplies exactly four — three
 * finder centres and, from version 2 up, the bottom-right alignment pattern.
 *
 * Everything here is plain arithmetic on eight coefficients. There is no
 * matrix library and no iteration.
 */

/**
 * A 3x3 projective transform, stored row-major with `a33` fixed at 1.
 *
 * Homographies are scale-invariant, so fixing the last coefficient loses
 * nothing and keeps the arithmetic in eight numbers rather than nine.
 */
export interface PerspectiveTransform {
  readonly a11: number;
  readonly a12: number;
  readonly a13: number;
  readonly a21: number;
  readonly a22: number;
  readonly a23: number;
  readonly a31: number;
  readonly a32: number;
  readonly a33: number;
}

/** Map a point through the transform, dividing out the homogeneous coordinate. */
export const transformPoint = (
  t: PerspectiveTransform,
  x: number,
  y: number,
): { x: number; y: number } => {
  const denominator = t.a13 * x + t.a23 * y + t.a33;
  return {
    x: (t.a11 * x + t.a21 * y + t.a31) / denominator,
    y: (t.a12 * x + t.a22 * y + t.a32) / denominator,
  };
};

/**
 * The transform taking the unit square to an arbitrary quadrilateral, with
 * corners given in the order (0,0), (1,0), (1,1), (0,1).
 *
 * When the quadrilateral is a parallelogram the projective terms vanish and
 * this degenerates to an affine map — worth special-casing, because that is
 * exactly the case a rendered, unrotated symbol produces and the general
 * formula would divide by zero there.
 */
const squareToQuadrilateral = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): PerspectiveTransform => {
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;

  if (dx3 === 0 && dy3 === 0) {
    // A parallelogram: affine, no perspective division needed.
    return {
      a11: x1 - x0,
      a12: y1 - y0,
      a13: 0,
      a21: x2 - x1,
      a22: y2 - y1,
      a23: 0,
      a31: x0,
      a32: y0,
      a33: 1,
    };
  }

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const a13 = (dx3 * dy2 - dx2 * dy3) / denominator;
  const a23 = (dx1 * dy3 - dx3 * dy1) / denominator;

  return {
    a11: x1 - x0 + a13 * x1,
    a12: y1 - y0 + a13 * y1,
    a13,
    a21: x3 - x0 + a23 * x3,
    a22: y3 - y0 + a23 * y3,
    a23,
    a31: x0,
    a32: y0,
    a33: 1,
  };
};

/**
 * The adjoint, which for a projective transform is the inverse up to a scale
 * factor — and scale does not matter, because the result is divided through by
 * its own homogeneous coordinate anyway. Using the adjoint avoids computing a
 * determinant that would immediately cancel.
 */
const adjoint = (t: PerspectiveTransform): PerspectiveTransform => ({
  a11: t.a22 * t.a33 - t.a23 * t.a32,
  a12: t.a13 * t.a32 - t.a12 * t.a33,
  a13: t.a12 * t.a23 - t.a13 * t.a22,
  a21: t.a23 * t.a31 - t.a21 * t.a33,
  a22: t.a11 * t.a33 - t.a13 * t.a31,
  a23: t.a13 * t.a21 - t.a11 * t.a23,
  a31: t.a21 * t.a32 - t.a22 * t.a31,
  a32: t.a12 * t.a31 - t.a11 * t.a32,
  a33: t.a11 * t.a22 - t.a12 * t.a21,
});

const multiply = (a: PerspectiveTransform, b: PerspectiveTransform): PerspectiveTransform => ({
  a11: a.a11 * b.a11 + a.a21 * b.a12 + a.a31 * b.a13,
  a12: a.a12 * b.a11 + a.a22 * b.a12 + a.a32 * b.a13,
  a13: a.a13 * b.a11 + a.a23 * b.a12 + a.a33 * b.a13,
  a21: a.a11 * b.a21 + a.a21 * b.a22 + a.a31 * b.a23,
  a22: a.a12 * b.a21 + a.a22 * b.a22 + a.a32 * b.a23,
  a23: a.a13 * b.a21 + a.a23 * b.a22 + a.a33 * b.a23,
  a31: a.a11 * b.a31 + a.a21 * b.a32 + a.a31 * b.a33,
  a32: a.a12 * b.a31 + a.a22 * b.a32 + a.a32 * b.a33,
  a33: a.a13 * b.a31 + a.a23 * b.a32 + a.a33 * b.a33,
});

/**
 * The transform taking one quadrilateral to another, given four point pairs in
 * matching order.
 *
 * Composed by routing through the unit square: source to square, then square
 * to destination. Both halves have closed forms, so no linear system is solved.
 */
export const quadrilateralToQuadrilateral = (
  // Source, in grid coordinates.
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  sx3: number,
  sy3: number,
  // Destination, in image coordinates.
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  dx3: number,
  dy3: number,
): PerspectiveTransform =>
  multiply(
    squareToQuadrilateral(dx0, dy0, dx1, dy1, dx2, dy2, dx3, dy3),
    adjoint(squareToQuadrilateral(sx0, sy0, sx1, sy1, sx2, sy2, sx3, sy3)),
  );

/**
 * Sample a module grid out of a binarised image through a transform.
 *
 * Each module is read at its own centre, which is the most forgiving point to
 * sample: it is the furthest from every neighbour, so it tolerates the most
 * error in the fitted transform before it starts reading the module next door.
 *
 * Returns `null` when any sample falls outside the image. A partially-sampled
 * grid decodes to plausible nonsense often enough to be worth refusing
 * outright — a symbol running off the edge of the frame is not readable, and
 * saying so is more useful than returning corrupt data.
 */
export const sampleGrid = (
  dark: Uint8Array,
  width: number,
  height: number,
  gridWidth: number,
  gridHeight: number,
  transform: PerspectiveTransform,
): Uint8Array | null => {
  const modules = new Uint8Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const point = transformPoint(transform, x + 0.5, y + 0.5);
      const px = Math.floor(point.x);
      const py = Math.floor(point.y);
      if (px < 0 || py < 0 || px >= width || py >= height) return null;
      modules[y * gridWidth + x] = dark[py * width + px];
    }
  }
  return modules;
};
