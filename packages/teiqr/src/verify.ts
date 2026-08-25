/**
 * `teiqr/verify` — prove a symbol still decodes.
 *
 * Decoding is the other half of encoding, and having it in the same package
 * makes a claim possible that no other JavaScript QR library can make: that a
 * styled, logo-bearing symbol *provably* reads, checked by actually recovering
 * the payload through Reed-Solomon correction rather than by estimating from a
 * coverage percentage.
 */

export {
  type JoinedResult,
  joinStructured,
  type ScanInput,
  type ScanOptions,
  scan,
  scanAll,
  scanAsync,
  tryScan,
} from './verify/api.js';
export {
  type DecodedSegment,
  type DecodeResult,
  decodeMatrix,
  readFormatInfo,
  type StructuredHeader,
  UncorrectableError,
} from './verify/decode-matrix.js';
export {
  decodeMicroMatrix,
  type MicroDecodeResult,
  readMicroFormat,
} from './verify/decode-micro.js';
export {
  decodeRmqrMatrix,
  type RmqrDecodeResult,
  readRmqrFormat,
} from './verify/decode-rmqr.js';
export { type Candidate, findFinders } from './verify/finder.js';
export {
  type ImageDataLike,
  type ImageInput,
  type NormalizedImage,
  type RawPixels,
  toPixels,
  toPixelsAsync,
} from './verify/input.js';
export { readCompactAt, readMicroAt, readRmqrAt } from './verify/locate-compact.js';
export {
  type PerspectiveTransform,
  quadrilateralToQuadrilateral,
  sampleGrid,
  transformPoint,
} from './verify/perspective.js';
export { correct } from './verify/reed-solomon.js';
export {
  binarize,
  decodeLocation,
  groupFinders,
  locateSymbols,
  NotFoundError,
  type ScanResult,
  type SymbolLocation,
  scanAllPixels,
  scanPixels,
} from './verify/scan.js';
