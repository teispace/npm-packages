/**
 * Opt-in registry for image formats beyond PNG.
 *
 * PNG is decoded natively everywhere because it is small and every rendered
 * symbol is one. JPEG is a different trade: a baseline decoder is several
 * kilobytes of Huffman and IDCT that most callers never need, since a code
 * they generated is never a JPEG. Making everyone carry it so that some can
 * scan photographs is the wrong default.
 *
 * So `teiqr/verify` ships the hook and `teiqr/jpeg` fills it:
 *
 * ```ts
 * import { scan } from 'teiqr/verify';
 * import 'teiqr/jpeg';   // side-effect import; now scan() reads JPEG too
 * ```
 *
 * **No entry point does this for you**, matching how `teiqr/kanji` works. With
 * nothing registered, `scan()` on a JPEG throws the same message it always did,
 * pointing at `scanAsync()` and the host's `createImageBitmap`.
 */

/** A decoded image, in the shape the scanner works in. */
export interface DecodedImage {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Decode `bytes`, or return `null` when they are not this decoder's format.
 *
 * Returning `null` rather than throwing is what lets several decoders be
 * registered and tried in turn: "not mine" has to be distinguishable from
 * "mine, and broken", or the first decoder would swallow every other format.
 */
export type ImageDecoder = (bytes: Uint8Array) => DecodedImage | null;

const decoders: ImageDecoder[] = [];

/**
 * Install a decoder. Called by `teiqr/jpeg`, and available to anyone wiring in
 * their own WebP or AVIF reader.
 *
 * Registering the same function twice is a no-op, so a module that is imported
 * from several places does not stack up duplicate attempts.
 */
export const registerImageDecoder = (decoder: ImageDecoder): void => {
  if (!decoders.includes(decoder)) decoders.push(decoder);
};

/** Every registered decoder, in registration order. */
export const getImageDecoders = (): readonly ImageDecoder[] => decoders;

/**
 * Try each registered decoder in turn.
 *
 * A decoder that recognises the format and then fails is a real error and is
 * allowed to propagate — a corrupt JPEG should say so, not fall through to a
 * generic "unsupported format" that sends the caller looking in the wrong
 * place entirely.
 */
export const decodeRegistered = (bytes: Uint8Array): DecodedImage | null => {
  for (const decoder of decoders) {
    const image = decoder(bytes);
    if (image) return image;
  }
  return null;
};
