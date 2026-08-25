import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// Side-effect import: registers the decoder, exactly as a consumer would.
import '../src/jpeg.js';
import { decodeJpeg, isJpeg } from '../src/raster/jpeg.js';
import { decodePng } from '../src/raster/png.js';
import { scan, tryScan } from '../src/verify/api.js';
import { registerImageDecoder } from '../src/verify/image-registry.js';
import { toPixels } from '../src/verify/input.js';

/**
 * Baseline JPEG, against files this package did not encode.
 *
 * Every fixture was produced by macOS `sips` from the PNG beside them — a real,
 * independent encoder — so the Huffman tables, quantisation tables, restart
 * intervals and subsampling choices are all somebody else's. See
 * `fixtures/jpeg/README.md` for how to regenerate them.
 *
 * The point of decoding a photograph at all is that a camera never produces a
 * PNG. A scanner that reads only PNG reads what a website served and never what
 * someone actually shot.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'jpeg');
const load = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)));

const PAYLOAD = 'teiqr jpeg fixture';
/** The exact image the fixtures were encoded from. */
const source = decodePng(load('source.png'));

/** Mean absolute difference per colour channel against the source image. */
const meanError = (pixels: Uint8Array): number => {
  let total = 0;
  let count = 0;
  for (let i = 0; i < source.pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      total += Math.abs(pixels[i + c] - source.pixels[i + c]);
      count++;
    }
  }
  return total / count;
};

describe('baseline JPEG decoding', () => {
  it.each([
    ['qr-444.jpg', '4:4:4, no chroma subsampling'],
    ['qr-420.jpg', '4:2:0, chroma at quarter resolution'],
    ['qr-low.jpg', '4:2:0 at low quality, heavy ringing'],
    ['qr-gray.jpg', 'single-component greyscale'],
  ])('decodes %s — %s', (name) => {
    const image = decodeJpeg(load(name));
    expect(image.width).toBe(source.width);
    expect(image.height).toBe(source.height);
    expect(image.pixels.length).toBe(source.width * source.height * 4);
  });

  /**
   * The check that actually pins the transform.
   *
   * A QR code scanning is a weak signal — error correction and thresholding
   * forgive a great deal, so a decoder with a mis-scaled IDCT or a swapped
   * chroma coefficient can still produce something readable. Comparing against
   * the exact pixels it was encoded from does not forgive: at the highest
   * quality setting the encoder is very nearly lossless, so anything beyond a
   * rounding difference is a real defect in the transform.
   */
  it('reproduces the source pixels almost exactly at high quality', () => {
    expect(meanError(decodeJpeg(load('qr-444.jpg')).pixels)).toBeLessThan(0.5);
  });

  it('degrades in step with the quality it was encoded at', () => {
    // Ordering matters more than any single figure: it shows the decoder is
    // tracking the encoder's quantisation rather than adding error of its own.
    const best = meanError(decodeJpeg(load('qr-444.jpg')).pixels);
    const normal = meanError(decodeJpeg(load('qr-420.jpg')).pixels);
    const low = meanError(decodeJpeg(load('qr-low.jpg')).pixels);
    expect(best).toBeLessThan(normal);
    expect(normal).toBeLessThan(low);
    expect(low).toBeLessThan(20);
  });

  it('returns neutral grey for a single-component file', () => {
    const { pixels } = decodeJpeg(load('qr-gray.jpg'));
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]) {
        throw new Error(`Component ${i / 4} is not neutral: ${pixels.slice(i, i + 3)}`);
      }
    }
    expect(meanError(pixels)).toBeLessThan(2);
  });

  it('marks every pixel opaque, since JPEG has no alpha', () => {
    const { pixels } = decodeJpeg(load('qr-420.jpg'));
    const alphas = new Set<number>();
    for (let i = 3; i < pixels.length; i += 4) alphas.add(pixels[i]);
    expect(alphas).toEqual(new Set([255]));
  });
});

describe('scanning a JPEG end to end', () => {
  it.each(['qr-444.jpg', 'qr-420.jpg', 'qr-low.jpg', 'qr-gray.jpg'])('reads %s', (name) => {
    expect(scan(load(name)).text).toBe(PAYLOAD);
  });

  it('reads a JPEG data URL', () => {
    const base64 = Buffer.from(load('qr-420.jpg')).toString('base64');
    expect(scan(`data:image/jpeg;base64,${base64}`).text).toBe(PAYLOAD);
  });
});

describe('formats and files it refuses', () => {
  it('recognises its own signature and nothing else', () => {
    expect(isJpeg(load('qr-420.jpg'))).toBe(true);
    expect(isJpeg(load('source.png'))).toBe(false);
    expect(isJpeg(Uint8Array.from([0xff]))).toBe(false);
    expect(isJpeg(new Uint8Array(0))).toBe(false);
  });

  it('names progressive JPEG rather than decoding it wrongly', () => {
    // A progressive file's coefficients arrive across several scans by spectral
    // band. Decoding it as baseline would not fail — it would produce a smeared
    // image from the first scan alone, which is worse than an error because it
    // looks like a scanner problem rather than a format one.
    const bytes = load('qr-420.jpg');
    const sof = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0);
    expect(sof).toBeGreaterThan(0);
    const progressive = Uint8Array.from(bytes);
    progressive[sof + 1] = 0xc2;
    expect(() => decodeJpeg(progressive)).toThrow(/Progressive JPEG is not supported/);
  });

  it('names arithmetic coding rather than producing noise', () => {
    const bytes = load('qr-420.jpg');
    const sof = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0);
    const arithmetic = Uint8Array.from(bytes);
    arithmetic[sof + 1] = 0xc9;
    expect(() => decodeJpeg(arithmetic)).toThrow(/Arithmetic-coded/);
  });

  it('rejects bytes that are not a JPEG at all', () => {
    expect(() => decodeJpeg(load('source.png'))).toThrow(/Not a JPEG/);
  });

  /**
   * Truncation must terminate. This is the same failure mode that hung the PNG
   * decoder: the Huffman walk consumes bits in a loop, and a reader that
   * returns zeros forever past the end never leaves it.
   */
  it('terminates on every truncation of a real file', () => {
    const full = load('qr-420.jpg');
    for (let length = 2; length < full.length; length += 137) {
      const bytes = full.subarray(0, length);
      try {
        const image = decodeJpeg(bytes);
        expect(image.pixels.length, `truncated to ${length}`).toBe(image.width * image.height * 4);
      } catch {
        // Failing is the expected outcome; hanging is the one being ruled out.
      }
    }
  });

  it('terminates on corrupted entropy data', () => {
    const full = load('qr-420.jpg');
    for (let seed = 0; seed < 40; seed++) {
      const bytes = Uint8Array.from(full);
      // Past the headers, so the corruption lands in the entropy-coded segment.
      for (let i = 0; i < 8; i++) {
        bytes[((seed * 977 + i * 31) % (bytes.length - 700)) + 700] ^= 0xa5;
      }
      try {
        decodeJpeg(bytes);
      } catch {
        // Either outcome is fine, as long as it is an outcome.
      }
    }
    expect(true).toBe(true);
  });
});

describe('the decoder registry', () => {
  // The registry is module-level and persists for the whole file, so each test
  // below claims its own signature byte. Sharing one would make these pass or
  // fail depending on the order they ran in, which is worse than not testing
  // it: registrations from an earlier case would satisfy a later one.
  const bytesLeadingWith = (signature: number): Uint8Array =>
    Uint8Array.from([signature, 0x49, 0x46, 0x46, 1, 2, 3, 4, 9, 9, 9, 9]);

  it('asks every decoder until one claims the bytes', () => {
    let asked = 0;
    registerImageDecoder((bytes) => {
      if (bytes[0] === 0x91) asked++;
      return null;
    });
    // A decoder returning null means "not my format", so the search continues
    // and ends in the normal unsupported-format error rather than treating the
    // null as a decode failure.
    expect(() => toPixels(bytesLeadingWith(0x91))).toThrow(/Unsupported image format/);
    expect(asked).toBe(1);
  });

  it('stops at the first decoder that claims them', () => {
    let laterAsked = 0;
    registerImageDecoder((bytes) =>
      bytes[0] === 0x92
        ? { pixels: new Uint8Array(4 * 4 * 4).fill(0xff), width: 4, height: 4 }
        : null,
    );
    registerImageDecoder((bytes) => {
      if (bytes[0] === 0x92) laterAsked++;
      return null;
    });

    const image = toPixels(bytesLeadingWith(0x92));
    expect([image.width, image.height]).toEqual([4, 4]);
    expect(laterAsked).toBe(0);
  });

  it('points at teiqr/jpeg when nothing handles the bytes', () => {
    expect(() => toPixels(bytesLeadingWith(0x93))).toThrow(/import 'teiqr\/jpeg'/);
  });

  it('ignores a decoder registered twice', () => {
    let asked = 0;
    const decoder = (bytes: Uint8Array): null => {
      if (bytes[0] === 0x94) asked++;
      return null;
    };
    registerImageDecoder(decoder);
    registerImageDecoder(decoder);
    expect(() => toPixels(bytesLeadingWith(0x94))).toThrow(/Unsupported image format/);
    expect(asked).toBe(1);
  });

  it('leaves PNG on its native path', () => {
    // PNG is decoded before the registry is consulted, so a registered decoder
    // never sees one.
    let asked = 0;
    registerImageDecoder(() => {
      asked++;
      return null;
    });
    expect(tryScan(load('source.png'))?.text).toBe(PAYLOAD);
    expect(asked).toBe(0);
  });
});

/**
 * Headers rewritten by hand, because no encoder will produce these on request.
 *
 * A decoder's error paths are the ones a fixture can never reach: every real
 * file is well-formed by construction. Rewriting bytes of a valid file is the
 * only way to ask what happens when a slot number is out of range or a frame
 * type is one nobody implements, and "what happens" should be a sentence
 * naming the problem rather than a wrong image.
 */
describe('headers rewritten by hand', () => {
  /** Offset of the first `FFxx` segment of the given marker, or -1. */
  const markerAt = (bytes: Uint8Array, marker: number): number => {
    for (let i = 2; i + 1 < bytes.length; ) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const found = bytes[i + 1];
      if (found === marker) return i;
      if (found === 0xda || found === 0xd9) return -1;
      if (found === 0xd8 || found === 0x01 || (found >= 0xd0 && found <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return -1;
  };

  /** A copy of the 4:2:0 fixture with one byte changed. */
  const patched = (at: number, value: number): Uint8Array => {
    const bytes = Uint8Array.from(load('qr-420.jpg'));
    bytes[at] = value;
    return bytes;
  };

  const sofAt = markerAt(load('qr-420.jpg'), 0xc0);
  const dqtAt = markerAt(load('qr-420.jpg'), 0xdb);
  const dhtAt = markerAt(load('qr-420.jpg'), 0xc4);

  it('finds the segments these tests rely on', () => {
    // If the fixture is ever regenerated into a different segment order, every
    // test below would silently patch the wrong byte and pass for the wrong
    // reason. This is the guard against that.
    expect(sofAt).toBeGreaterThan(0);
    expect(dqtAt).toBeGreaterThan(0);
    expect(dhtAt).toBeGreaterThan(0);
  });

  it('rejects a quantisation table slot outside 0-3', () => {
    expect(() => decodeJpeg(patched(dqtAt + 4, 0x04))).toThrow(/quantisation table slot/);
  });

  it('rejects a Huffman table slot outside 0-3', () => {
    expect(() => decodeJpeg(patched(dhtAt + 4, 0x05))).toThrow(/Huffman table slot/);
  });

  it('rejects a sample precision other than 8', () => {
    expect(() => decodeJpeg(patched(sofAt + 4, 12))).toThrow(/sample precision/);
  });

  it('rejects a zero dimension', () => {
    // Width lives at SOF + 7..8; zeroing both bytes makes it zero.
    const bytes = patched(sofAt + 7, 0);
    bytes[sofAt + 8] = 0;
    expect(() => decodeJpeg(bytes)).toThrow(/dimensions out of range/);
  });

  it('names CMYK rather than reporting a generic component count', () => {
    // Four components is a real, common format — an unhelpful message here
    // would send someone looking for corruption rather than a colour space.
    expect(() => decodeJpeg(patched(sofAt + 9, 4))).toThrow(/CMYK/);
  });

  it('rejects a component count it cannot interpret', () => {
    expect(() => decodeJpeg(patched(sofAt + 9, 2))).toThrow(/component count/);
  });

  it('rejects impossible sampling factors', () => {
    // The first component's sampling byte, whose nibbles must both be 1-4.
    expect(() => decodeJpeg(patched(sofAt + 11, 0x00))).toThrow(/sampling factors/);
    expect(() => decodeJpeg(patched(sofAt + 11, 0x59))).toThrow(/sampling factors/);
  });

  it('names every frame type it does not implement', () => {
    // Lossless, differential and hierarchical modes all exist in the standard
    // and none is decodable here. Each should say which one it was.
    for (const marker of [0xc3, 0xc5, 0xc6, 0xc7, 0xcb, 0xcd, 0xce, 0xcf]) {
      expect(() => decodeJpeg(patched(sofAt + 1, marker)), `SOF${marker - 0xc0}`).toThrow(
        /Unsupported JPEG frame type/,
      );
    }
  });

  it('reports a quantisation table the frame refers to but no segment defined', () => {
    // The first component's table selector, pointed at a slot never sent.
    expect(() => decodeJpeg(patched(sofAt + 12, 3))).toThrow(/Missing quantisation table 3/);
  });

  it('reports a scan naming a component the frame never declared', () => {
    const sosAt = (() => {
      const bytes = load('qr-420.jpg');
      for (let i = 2; i + 1 < bytes.length; ) {
        if (bytes[i] === 0xff && bytes[i + 1] === 0xda) return i;
        if (bytes[i] !== 0xff) {
          i++;
          continue;
        }
        i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
      }
      return -1;
    })();
    expect(sosAt).toBeGreaterThan(0);
    expect(() => decodeJpeg(patched(sosAt + 5, 0x7f))).toThrow(/unknown component 127/);
  });

  /**
   * 16-bit quantisation tables, which high-quality encoders do emit and none of
   * the fixtures use. The table is rewritten to 16-bit with identical values,
   * so a correct decoder must produce byte-identical output — this is about the
   * two-byte read path, not about any change in the image.
   */
  it('reads a 16-bit quantisation table identically to its 8-bit form', () => {
    const original = load('qr-420.jpg');
    const length = (original[dqtAt + 2] << 8) | original[dqtAt + 3];
    const body = original.subarray(dqtAt + 4, dqtAt + 2 + length);

    // Re-emit every table in the segment at 16-bit precision.
    const widened: number[] = [];
    for (let at = 0; at < body.length; ) {
      const slot = body[at] & 15;
      at++;
      widened.push(0x10 | slot);
      for (let i = 0; i < 64; i++, at++) widened.push(0, body[at]);
    }

    const segment = [0xff, 0xdb, ((widened.length + 2) >> 8) & 0xff, (widened.length + 2) & 0xff];
    const rebuilt = Uint8Array.from([
      ...original.subarray(0, dqtAt),
      ...segment,
      ...widened,
      ...original.subarray(dqtAt + 2 + length),
    ]);

    expect(decodeJpeg(rebuilt).pixels).toEqual(decodeJpeg(original).pixels);
  });
});
