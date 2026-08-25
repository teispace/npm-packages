/**
 * DEFLATE length and distance tables, RFC 1951 §3.2.5.
 *
 * Shared by the compressor and the decompressor. They must agree exactly —
 * a single transposed digit produces streams that round-trip through this
 * library and are rejected by every other zlib implementation — so they are
 * defined once here rather than transcribed twice.
 */

/** Base match length for length codes 257-285. */
// biome-ignore format: aligned tables read far better than wrapped ones
export const LENGTH_BASE: readonly number[] = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];

/** Extra bits following each length code. */
// biome-ignore format: as above
export const LENGTH_EXTRA: readonly number[] = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];

/** Base backward distance for distance codes 0-29. */
// biome-ignore format: as above
export const DIST_BASE: readonly number[] = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];

/** Extra bits following each distance code. */
// biome-ignore format: as above
export const DIST_EXTRA: readonly number[] = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

/**
 * Code lengths for the fixed literal/length alphabet, RFC 1951 §3.2.6.
 * Symbols 0-143 are 8 bits, 144-255 are 9, 256-279 are 7, and 280-287 are 8.
 */
export const fixedLiteralLengths = (): number[] =>
  Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));

/**
 * Paeth predictor, PNG filter type 4 (ISO/IEC 15948 §9.4).
 *
 * Lives here rather than in the PNG module because both the filter and the
 * unfilter path need it, and it is pure arithmetic shared by the two.
 */
export const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};
