/**
 * Normalise "some image, somehow" into RGBA pixels.
 *
 * A decoder is only as useful as the range of things you can hand it. In
 * practice an image arrives as a Node `Buffer` from `readFile`, a `Uint8Array`
 * from `fetch`, an `ArrayBuffer`, a base64 data URL from a file input, an
 * `ImageData` from a canvas, a `<canvas>` or `<video>` element, or an
 * `ImageBitmap` from `createImageBitmap`. Every one of those funnels through
 * here so the decoder itself only ever sees pixels.
 *
 * Nothing in this module is required at encode time, and the DOM types it
 * touches are declared structurally rather than imported, so the package still
 * compiles and runs with no DOM lib present.
 */

import { decodePng } from '../raster/png.js';
import { decodeRegistered } from './image-registry.js';

/** The shape a canvas `getImageData()` returns. */
export interface ImageDataLike {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Anything with intrinsic dimensions that a canvas can draw. */
interface DrawableLike {
  readonly width?: number;
  readonly height?: number;
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
}

/** Raw pixels, when the caller already knows the dimensions. */
export interface RawPixels {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Bytes per pixel. 4 (RGBA) by default; 3 (RGB) and 1 (grayscale) also work. */
  readonly channels?: 1 | 3 | 4;
}

/**
 * Everything {@link toPixels} accepts.
 *
 * - Encoded image bytes (`Uint8Array`, `ArrayBuffer`, Node `Buffer`) — PNG is
 *   decoded natively; other formats need a browser or a `decode` hook.
 * - A `data:` URL or a bare base64 string of an encoded image.
 * - An `ImageData`, or any `{ data, width, height }` object.
 * - A `<canvas>`, `<img>`, `<video>` or `ImageBitmap`, in environments that
 *   have a canvas to draw it on.
 */
export type ImageInput = Uint8Array | ArrayBuffer | ImageDataLike | RawPixels | string | object;

export interface NormalizedImage {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);

/** Expand 1- or 3-channel pixel data to RGBA in place of a copy loop per caller. */
const toRgba = (
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
): Uint8Array => {
  if (channels === 4) {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (channels === 1) {
      out[d] = out[d + 1] = out[d + 2] = data[s];
    } else {
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
    }
    out[d + 3] = 255;
  }
  return out;
};

const base64ToBytes = (base64: string): Uint8Array => {
  const clean = base64.replace(/\s/g, '');
  if (typeof atob === 'function') return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new Uint8Array(Buffer.from(clean, 'base64'));
};

/** Draw an already-decoded drawable (canvas, image, video, bitmap) to pixels. */
const drawableToPixels = (source: DrawableLike): NormalizedImage | null => {
  const g = globalThis as Record<string, unknown>;
  const width = source.naturalWidth ?? source.videoWidth ?? source.width ?? 0;
  const height = source.naturalHeight ?? source.videoHeight ?? source.height ?? 0;
  if (!width || !height) return null;

  type Ctx2d = {
    drawImage(image: unknown, x: number, y: number): void;
    getImageData(x: number, y: number, w: number, h: number): ImageDataLike;
  };

  // An OffscreenCanvas works in Workers as well as the main thread.
  const OffscreenCanvasCtor = g.OffscreenCanvas as
    | (new (
        w: number,
        h: number,
      ) => { getContext(t: '2d'): Ctx2d | null })
    | undefined;

  let context: Ctx2d | null = null;
  if (OffscreenCanvasCtor) {
    context = new OffscreenCanvasCtor(width, height).getContext('2d');
  } else {
    const doc = g.document as { createElement(tag: string): unknown } | undefined;
    if (!doc) return null;
    const canvas = doc.createElement('canvas') as {
      width: number;
      height: number;
      getContext(t: '2d'): Ctx2d | null;
    };
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d');
  }
  if (!context) return null;

  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, width, height);
  return { pixels: new Uint8Array(image.data), width, height };
};

/**
 * Turn any supported input into RGBA pixels.
 *
 * @throws {TypeError} when the input cannot be interpreted as an image.
 */
export const toPixels = (input: ImageInput): NormalizedImage => {
  // Already-normalised pixel data, including canvas ImageData.
  if (typeof input === 'object' && input !== null && 'data' in input && 'width' in input) {
    const source = input as RawPixels;
    const channels =
      source.channels ??
      (source.data.length === source.width * source.height * 3
        ? 3
        : source.data.length === source.width * source.height
          ? 1
          : 4);
    return {
      pixels: toRgba(source.data, source.width, source.height, channels),
      width: source.width,
      height: source.height,
    };
  }

  if (typeof input === 'string') {
    const match = /^data:[^;,]*;base64,(.*)$/is.exec(input.trim());
    const bytes = base64ToBytes(match ? match[1] : input);
    return toPixels(bytes);
  }

  let bytes: Uint8Array | null = null;
  if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  if (bytes) {
    if (isPng(bytes)) {
      const { pixels, width, height } = decodePng(bytes);
      return { pixels, width, height };
    }
    // Formats added by a side-effect import, such as `teiqr/jpeg`.
    const registered = decodeRegistered(bytes);
    if (registered) {
      return { pixels: registered.pixels, width: registered.width, height: registered.height };
    }
    // Nothing else can be done *synchronously*. A browser can decode WebP and
    // AVIF, but only through `createImageBitmap`, which returns a promise —
    // there is no host API that turns encoded bytes into pixels without
    // awaiting something. That is the whole reason `scanAsync` exists, and why
    // this is an error rather than a fallback.
    throw new TypeError(
      "Unsupported image format. PNG is decoded natively; for JPEG add `import 'teiqr/jpeg'`. " +
        'For WebP or AVIF either use scanAsync(), or decode to pixels yourself and pass ' +
        '{ data, width, height }.',
    );
  }

  if (typeof input === 'object' && input !== null) {
    const drawn = drawableToPixels(input as DrawableLike);
    if (drawn) return drawn;
  }

  throw new TypeError(
    'Could not interpret the input as an image. Pass PNG bytes, a data URL, ' +
      '{ data, width, height }, or a canvas/image/video/ImageBitmap.',
  );
};

/**
 * Asynchronous normalisation, which additionally handles JPEG, WebP and AVIF
 * wherever the host provides `createImageBitmap` — browsers, Workers, Deno,
 * and Node with a canvas polyfill.
 */
export const toPixelsAsync = async (input: ImageInput): Promise<NormalizedImage> => {
  try {
    return toPixels(input);
  } catch (error) {
    const g = globalThis as Record<string, unknown>;
    const createImageBitmap = g.createImageBitmap as
      | ((source: unknown) => Promise<DrawableLike>)
      | undefined;
    const Blob_ = g.Blob as (new (parts: unknown[]) => unknown) | undefined;
    if (!createImageBitmap || !Blob_) throw error;

    let bytes: Uint8Array | null = null;
    if (input instanceof Uint8Array) bytes = input;
    else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else if (typeof input === 'string') {
      const match = /^data:[^;,]*;base64,(.*)$/is.exec(input.trim());
      bytes = base64ToBytes(match ? match[1] : input);
    }
    if (!bytes) throw error;

    const bitmap = await createImageBitmap(new Blob_([bytes]));
    const drawn = drawableToPixels(bitmap);
    if (!drawn) throw error;
    return drawn;
  }
};
