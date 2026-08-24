/**
 * `teiqr/raster` — PNG output with no canvas and no dependencies.
 *
 * Contains a complete DEFLATE compressor, a PNG encoder/decoder, and an
 * anti-aliased scanline rasteriser, so the same synchronous call produces
 * byte-identical output in Node, browsers, Cloudflare Workers, Deno and Bun.
 */

export { adler32, deflateRaw, zlibDeflate } from './raster/deflate.js';
export { parsePathData, type Segment, type SubPath } from './raster/path.js';
export { crc32, decodePng, encodePng, inflateZlib, type PngOptions } from './raster/png.js';
export { makePaint, type PixelPaint, Raster, type Transform } from './raster/rasterize.js';
export {
  type RasterOptions,
  type RasterResult,
  rasterize,
  rasterizeScene,
  toPng,
} from './raster/scene-raster.js';
