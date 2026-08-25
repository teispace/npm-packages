/**
 * Baseline JPEG support for `scan()`.
 *
 * Importing this module registers the decoder as a side effect. Once
 * registered, every synchronous entry point — `scan`, `scanAll`, `tryScan` —
 * reads JPEG bytes the same way it reads PNG, in Node, a browser, a Worker,
 * Deno and Bun alike, with no canvas and no `await`.
 *
 * ```ts
 * import { scan } from 'teiqr/verify';
 * import 'teiqr/jpeg';
 *
 * scan(await readFile('photo.jpg')).text;
 * ```
 *
 * ### Why this is a separate entry point
 * A baseline decoder is Huffman tables, an inverse DCT and chroma upsampling —
 * several kilobytes that most callers never need, because a code they
 * generated is never a JPEG. The same reasoning that keeps the Shift-JIS table
 * in `teiqr/kanji` keeps this here: the default stays small, and nobody pays
 * for what they do not use.
 *
 * Without this import, `scan()` on a JPEG throws a message pointing at
 * `scanAsync()`, which uses the host's `createImageBitmap` where there is one.
 * That path still works and additionally handles WebP and AVIF; this one is
 * for the runtimes that have no such host API, and for callers who want a
 * photograph decoded synchronously.
 */

import { decodeJpeg, isJpeg } from './raster/jpeg.js';
import { registerImageDecoder } from './verify/image-registry.js';

registerImageDecoder((bytes) => (isJpeg(bytes) ? decodeJpeg(bytes) : null));

export { decodeJpeg, isJpeg } from './raster/jpeg.js';
