export type { PwaDetection } from './detect';
export { detectAppDir, detectPwa } from './detect';
export { runFavicon } from './pipeline';
export { buildShapeMask } from './shapes';
export type {
  FaviconFit,
  FaviconOptions,
  FaviconRunResult,
  FaviconShape,
  FaviconWriteResult,
} from './types';
export { isHexColor, parseSizes, validateSource } from './validate';
