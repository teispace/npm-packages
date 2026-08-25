/**
 * The public decoding API.
 *
 * One function that takes almost any representation of an image and returns
 * the payload. Everything specialised — pixel normalisation, finder-pattern
 * location, Reed-Solomon recovery — sits behind it.
 */

import type { QrMatrix } from '../core/types.js';
import { toGray } from './binarize.js';
import { type DecodeResult, decodeMatrix } from './decode-matrix.js';
import { type ImageInput, toPixels, toPixelsAsync } from './input.js';
import { NotFoundError, type ScanResult, scanAllGray, scanGray } from './scan.js';

/** Anything {@link scan} accepts: an image in any supported form, or a symbol already decoded. */
export type ScanInput = ImageInput | QrMatrix;

export interface ScanOptions {
  /**
   * Also try the inverted image when the first pass finds nothing.
   *
   * Light-on-dark codes are common in dark-themed apps and on packaging, and
   * are invisible to a decoder that only looks for dark finder patterns.
   * Costs a second pass only when the first fails, so it defaults on.
   */
  tryInverted?: boolean;
}

/**
 * A matrix, rather than an image, was handed in.
 *
 * Covers all three symbologies: QR and Micro QR are square and carry `size`,
 * rMQR is rectangular and carries `width` and `height` as well.
 */
const isMatrix = (input: unknown): input is QrMatrix =>
  typeof input === 'object' &&
  input !== null &&
  'modules' in input &&
  'kinds' in input &&
  'size' in input;

/**
 * Flip the image, in luminance.
 *
 * Inverting the colour channels and converting the result to luminance gives
 * the same answer as inverting the luminance directly — the conversion is a
 * weighted sum whose weights total one, so `255 - (wr*r + wg*g + wb*b)` is
 * `wr*(255-r) + wg*(255-g) + wb*(255-b)`. Doing it this way is a quarter of
 * the memory traffic and skips a second full conversion, which matters
 * because the inverted pass runs on every frame that fails — and behind a
 * camera, that is most of them.
 *
 * Alpha needs no handling here: the composite over white happened during the
 * original conversion, so what is left is opaque luminance.
 */
const invertGray = (gray: Uint8Array): Uint8Array => {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
  return out;
};

const attempt = (
  pixels: Uint8Array,
  width: number,
  height: number,
  tryInverted: boolean,
): ScanResult => {
  const gray = toGray(pixels, width, height);
  try {
    return scanGray(gray, width, height);
  } catch (error) {
    if (!tryInverted) throw error;
    try {
      return scanGray(invertGray(gray), width, height);
    } catch {
      // Report the original failure: it describes the image as given, which is
      // what the caller can act on.
      throw error;
    }
  }
};

/**
 * Decode a QR code.
 *
 * Accepts PNG bytes (`Uint8Array`, `ArrayBuffer`, Node `Buffer`), a `data:`
 * URL or bare base64, an `ImageData` or any `{ data, width, height }` object,
 * a `<canvas>`/`<img>`/`<video>`/`ImageBitmap`, or a {@link QrMatrix} this
 * library produced. JPEG, WebP and AVIF need {@link scanAsync}.
 *
 * @throws {NotFoundError} when no symbol can be located.
 * @throws {UncorrectableError} when a symbol is found but too damaged to read.
 *
 * @example
 * scan(await readFile('ticket.png')).text;
 * scan(context.getImageData(0, 0, w, h)).text;
 * scan('data:image/png;base64,iVBORw0…').text;
 */
export const scan = (input: ScanInput, options: ScanOptions = {}): ScanResult => {
  if (isMatrix(input)) {
    // A matrix needs no locating, so this path covers Micro QR and rMQR too;
    // it is only the pixel scanner that is QR-only, because it hunts for three
    // finder patterns and those symbologies have one apiece.
    const decoded = decodeMatrix(input);
    return { ...decoded, moduleSize: 1, origin: { x: 0, y: 0 } };
  }
  const { pixels, width, height } = toPixels(input);
  return attempt(pixels, width, height, options.tryInverted ?? true);
};

/**
 * Decode a QR code, additionally accepting JPEG, WebP and AVIF wherever the
 * host provides `createImageBitmap` — browsers, Workers, Deno, and Node with a
 * canvas polyfill. Falls back to the synchronous path for everything else.
 */
export const scanAsync = async (
  input: ScanInput,
  options: ScanOptions = {},
): Promise<ScanResult> => {
  if (isMatrix(input)) return scan(input, options);
  const { pixels, width, height } = await toPixelsAsync(input);
  return attempt(pixels, width, height, options.tryInverted ?? true);
};

/**
 * Decode without throwing. Returns `null` when nothing readable is found,
 * which is what a camera loop wants — most frames contain no code, and
 * exceptions are the wrong control flow for the common case.
 *
 * @example
 * const found = tryScan(frame);
 * if (found) onResult(found.text);
 */
export const tryScan = (input: ScanInput, options: ScanOptions = {}): ScanResult | null => {
  try {
    return scan(input, options);
  } catch {
    return null;
  }
};

/**
 * Locate and decode every QR code in an image.
 *
 * One pass: all finder patterns are found, grouped into symbols by their
 * geometry, and each group decoded. Results come back in reading order, top to
 * bottom then left to right.
 *
 * @example
 * const codes = scanAll(await readFile('sheet-of-tickets.png'));
 * codes.map((c) => c.text);
 */
export const scanAll = (
  input: ScanInput,
  options: ScanOptions & { maxSymbols?: number } = {},
): ScanResult[] => {
  if (isMatrix(input)) return [scan(input, options)];

  const { pixels, width, height } = toPixels(input);
  const gray = toGray(pixels, width, height);
  let found = scanAllGray(gray, width, height);
  if (found.length === 0 && (options.tryInverted ?? true)) {
    found = scanAllGray(invertGray(gray), width, height);
  }

  const limit = options.maxSymbols;
  return limit === undefined ? found : found.slice(0, limit);
};

/** A reassembled Structured Append payload. */
export interface JoinedResult {
  readonly text: string;
  readonly bytes: Uint8Array;
  /** How many symbols the set declared. */
  readonly count: number;
}

/**
 * Reassemble a Structured Append set from its decoded symbols.
 *
 * Symbols may arrive in any order — a person scanning a printed sheet will not
 * go left to right. The set is validated before joining: every symbol must
 * declare the same total and the same parity, and every index must be present
 * exactly once. The parity check is the one that catches a symbol accidentally
 * picked up from a *different* set, which index checks alone would miss.
 */
export const joinStructured = (results: readonly DecodeResult[]): JoinedResult => {
  if (results.length === 0) throw new RangeError('No symbols to join');

  const headers = results.map((r) => r.structured);
  if (headers.some((h) => h === undefined)) {
    if (results.length === 1) {
      // A lone standalone symbol is a valid, complete payload.
      return { text: results[0].text, bytes: results[0].bytes, count: 1 };
    }
    throw new RangeError('Every symbol must carry a Structured Append header');
  }

  const total = headers[0]?.total as number;
  const parity = headers[0]?.parity as number;
  if (headers.some((h) => h?.total !== total)) {
    throw new RangeError('Symbols disagree on how many are in the set');
  }
  if (headers.some((h) => h?.parity !== parity)) {
    throw new RangeError('Symbols carry different parities, so they are from different sets');
  }

  // `.fill()` matters: `new Array(n)` is sparse, and array iteration methods
  // skip holes — so a missing symbol would silently pass the check below.
  const ordered = new Array<DecodeResult | undefined>(total).fill(undefined);
  for (const result of results) {
    const index = result.structured?.index as number;
    if (index >= total) throw new RangeError(`Symbol index ${index} exceeds the set size ${total}`);
    if (ordered[index]) throw new RangeError(`Duplicate symbol at index ${index}`);
    ordered[index] = result;
  }

  const missing = ordered.flatMap((r, i) => (r ? [] : [i]));
  if (missing.length > 0) {
    throw new RangeError(
      `Set is incomplete: missing symbol${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`,
    );
  }

  const parts = ordered as DecodeResult[];
  const text = parts.map((r) => r.text).join('');
  const bytes = new TextEncoder().encode(text);
  return { text, bytes, count: total };
};

export type { DecodeResult, ImageInput, ScanResult };
export { NotFoundError };
