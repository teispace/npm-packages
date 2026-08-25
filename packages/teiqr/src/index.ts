/**
 * teiqr — the complete QR toolkit.
 *
 * ```ts
 * import { qr } from 'teiqr';
 *
 * qr('https://example.com').svg();                          // string
 * qr('https://example.com').png({ scale: 12 });              // Uint8Array
 * qr('https://example.com', { moduleShape: 'rounded' }).dataUrl();
 * qr('https://example.com').verify().text;                   // proves it scans
 * ```
 *
 * Everything is also available as named exports, and in finer-grained entry
 * points (`teiqr/core`, `teiqr/render`, `teiqr/raster`, …) when bundle size
 * matters more than convenience.
 */

import { encode } from './core/encode.js';
import type { EncodeOptions, QrInput, QrMatrix } from './core/types.js';
import { serializePayload } from './payload/index.js';
import { type ParsedPayload, parsePayload } from './payload/parse.js';
import { encodePng, type PngOptions } from './raster/png.js';
import { type RasterOptions, type RasterResult, rasterize } from './raster/scene-raster.js';
import { buildScene, type Scene } from './render/scene.js';
import { renderSvg } from './render/svg.js';
import type { QrStyle } from './render/types.js';
import { type TerminalOptions, toTerminal } from './terminal.js';
import { type ValidateOptions, type Validation, validate } from './validate/index.js';
import { type ScanInput, scan } from './verify/api.js';
import { type ScanResult, scanPixels } from './verify/scan.js';

/** Encoding and styling options in one bag, so callers configure a code in one place. */
export interface QrOptions extends EncodeOptions, Partial<QrStyle> {}

/** Options accepted by the raster outputs. */
export interface QrImageOptions extends RasterOptions, PngOptions {}

/**
 * A built symbol, with an output method per format.
 *
 * The matrix is encoded once when {@link qr} is called and reused by every
 * output, so producing an SVG and a PNG of the same code does the encoding
 * work once rather than twice.
 */
export interface QrCode {
  /** The placed symbol. Everything else is derived from this. */
  readonly matrix: QrMatrix;
  /** The style this code was built with, with defaults filled in. */
  readonly style: Partial<QrStyle>;
  /** Device-independent geometry, shared by every renderer. */
  scene(): Scene;
  /** SVG markup. */
  svg(): string;
  /** PNG bytes. Synchronous, dependency-free, identical in every runtime. */
  png(options?: QrImageOptions): Uint8Array;
  /** A `data:image/png;base64,...` URL, ready for an `<img src>`. */
  dataUrl(options?: QrImageOptions): string;
  /** Raw RGBA pixels, if you want to composite the code yourself. */
  pixels(options?: RasterOptions): RasterResult;
  /** Text rendering for a terminal. */
  terminal(options?: TerminalOptions): string;
  /** Scannability analysis: contrast, quiet zone, shape risk, logo damage, print size. */
  validate(options?: ValidateOptions): Validation;
  /**
   * Rasterise the code and read it back with the bundled scanner, proving it
   * decodes as styled. Throws if it does not.
   */
  verify(options?: RasterOptions): ScanResult;
}

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa === 'function') {
    let binary = '';
    // Chunked so a large image cannot blow the argument limit of `String.fromCharCode`.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
};

/**
 * Build a QR code.
 *
 * Accepts a string, a `Uint8Array` for arbitrary binary, or pre-built
 * segments. Encoding and styling options share one object: anything
 * {@link EncodeOptions} understands configures the symbol, anything
 * {@link QrStyle} understands configures how it looks.
 *
 * @example qr('https://example.com').svg()
 * @example qr('WIFI:T:WPA;S:Cafe;P:hunter2;;', { ecc: 'Q', moduleShape: 'rounded' }).png()
 */
export const qr = (data: QrInput, options: QrOptions = {}): QrCode => {
  const { ecc, minVersion, maxVersion, mask, boostEcc, eci, kanji, ...style } = options;
  const matrix = encode(data, { ecc, minVersion, maxVersion, mask, boostEcc, eci, kanji });

  return {
    matrix,
    style,
    scene: () => buildScene(matrix, style),
    svg: () => renderSvg(matrix, style).svg,
    png: (imageOptions = {}) => {
      const { pixels, width, height } = rasterize(matrix, style, imageOptions);
      return encodePng(pixels, width, height, imageOptions);
    },
    dataUrl: (imageOptions = {}) => {
      const { pixels, width, height } = rasterize(matrix, style, imageOptions);
      return `data:image/png;base64,${toBase64(encodePng(pixels, width, height, imageOptions))}`;
    },
    pixels: (rasterOptions = {}) => rasterize(matrix, style, rasterOptions),
    terminal: (terminalOptions = {}) => toTerminal(matrix, terminalOptions),
    validate: (validateOptions = {}) =>
      validate(matrix, { ...buildScene(matrix, style).style }, validateOptions),
    verify: (rasterOptions = {}) => {
      // A white ground and a generous scale, so verification measures the
      // symbol rather than the caller's transparent background.
      const { pixels, width, height } = rasterize(matrix, style, {
        scale: 10,
        background: '#ffffff',
        ...rasterOptions,
      });
      return scanPixels(pixels, width, height);
    },
  };
};

/** A code rebuilt from an existing one, carrying what it was read from. */
export interface ClonedCode extends QrCode {
  /** The scan the clone was built from, including version, level and mask. */
  readonly source: ScanResult;
  /**
   * The payload decomposed into fields — `values.ssid`, `values.password`, and
   * so on. Feed it back through `serializePayload(payload.type, values)` after
   * editing to rebuild the code without retyping anything.
   */
  readonly payload: ParsedPayload;
}

/**
 * Read an existing QR code and rebuild it in a new style.
 *
 * This is the "I have an old printed code and want a nicer one" path. The
 * payload is preserved byte for byte by default, so the clone scans to exactly
 * the same string — while {@link ClonedCode.payload} hands you the individual
 * fields, so a UI can offer "change the WiFi password" without the user
 * retyping the SSID.
 *
 * Pass `fields` to rebuild from edited values instead of the original string.
 *
 * @example
 * const cloned = clone(await readFile('old-code.png'), { moduleShape: 'rounded' });
 * cloned.payload.type;            // 'wifi'
 * cloned.payload.values.ssid;     // 'Cafe'
 * await writeFile('new-code.png', cloned.png({ scale: 12 }));
 *
 * @example Rebuild with an edited field
 * const old = clone(bytes);
 * const updated = clone(bytes, { moduleShape: 'dot' }, {
 *   ...old.payload.values, password: 'a-new-password',
 * });
 */
export const clone = (
  image: ScanInput,
  options: QrOptions = {},
  fields?: Record<string, string | undefined>,
): ClonedCode => {
  const source = scan(image);
  const payload = parsePayload(source.text);

  // Editing goes through the payload serialiser so escaping stays correct;
  // an untouched clone reuses the original string so it is preserved exactly,
  // even for a format no parser recognises.
  //
  // `fields` is an overlay, not a replacement. Passing only the fields being
  // changed is the whole point of the API — "scan this WiFi code and change
  // the password" — and serialising `fields` alone silently dropped the SSID
  // and every other field the caller did not happen to repeat. An explicit
  // `undefined` still clears a field, which is why the values are spread
  // rather than merged more defensively.
  const text = fields
    ? serializePayload(payload.type, { ...payload.values, ...fields })
    : source.text;

  // Carry the original error correction level across unless the caller says
  // otherwise: a code that was level H was probably printed for a reason.
  const built = qr(text, { ecc: source.ecc, ...options });
  return { ...built, source, payload };
};

export * from './core.js';
export * from './payload.js';
export * from './raster.js';
export * from './render.js';
export * from './terminal.js';
export * from './validate.js';
export * from './verify.js';
