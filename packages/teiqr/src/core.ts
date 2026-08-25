/**
 * `teiqr/core` — encoding only.
 *
 * The smallest useful entry point: turns data into a {@link QrMatrix} and
 * nothing else. No rendering, no DOM, no dependencies. Import this when you
 * have your own renderer, or when bundle size is the binding constraint.
 */

export { BitWriter, bitAt, EMPTY_BITS } from './core/bits.js';
export { ECI, type EciAssignment, eciDesignator, eciWidth, MAX_ECI } from './core/eci.js';
export { type BlockLayout, blockLayout, byteCapacity, encode } from './core/encode.js';
export { computeDivisor, computeRemainder, div, inv, mul, polyEval, pow } from './core/galois.js';
export {
  getKanjiTable,
  isKanjiAvailable,
  registerKanjiTable,
  type ShiftJisEncoder,
  shiftJisToKanjiBits,
} from './core/kanji-registry.js';
export {
  buildMatrix,
  dataModuleSequence,
  formatBits,
  functionPatternKinds,
  MASK_FUNCTIONS,
  penaltyScore,
  versionBits,
} from './core/matrix.js';
export {
  encodeMicro,
  MICRO_LEVELS,
  MICRO_MASK_FUNCTIONS,
  MICRO_VERSIONS,
  type MicroEncodeOptions,
  type MicroVersion,
  microDataBits,
  microFormatBits,
  microModeBits,
  microSize,
  microVersionOf,
} from './core/micro.js';
export {
  encodeRmqr,
  RMQR_SPECS,
  RMQR_VERSIONS,
  type RmqrEncodeOptions,
  type RmqrLevel,
  type RmqrVersion,
  rmqrFormatBits,
  rmqrMask,
  rmqrVersionOf,
} from './core/rmqr.js';
export type { RmqrBlockGroup, RmqrVersionSpec } from './core/rmqr-tables.js';
export {
  ALPHANUMERIC_CHARSET,
  buildSegments,
  countBits,
  isAlphanumeric,
  isCountlessMode,
  isNumeric,
  makeAlphanumericSegment,
  makeByteSegment,
  makeEciSegment,
  makeKanjiSegment,
  makeNumericSegment,
  makeSegments,
  modeIndicator,
  type Plan,
  planBits,
  planSegments,
  type SegmentPlan,
  totalBits,
} from './core/segment.js';
export {
  encodeStructured,
  MAX_SYMBOLS,
  readStructuredHeader,
  type StructuredOptions,
  type StructuredResult,
  structuredParity,
} from './core/structured.js';
export {
  type BitArray,
  type EccLevel,
  type EncodeOptions,
  MODULE,
  type ModuleKind,
  QrCapacityError,
  type QrInput,
  type QrMatrix,
  type QrMode,
  type QrSegment,
} from './core/types.js';
export {
  alignmentPatternPositions,
  capacityBits,
  ECC_ORDER,
  ECC_RECOVERY,
  eccCodewordsPerBlock,
  MAX_VERSION,
  MIN_VERSION,
  numDataCodewords,
  numEccBlocks,
  numRawDataModules,
  sizeForVersion,
} from './core/version.js';
