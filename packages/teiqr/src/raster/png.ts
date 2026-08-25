/**
 * PNG encoding (ISO/IEC 15948) on top of the bundled DEFLATE.
 *
 * Fully synchronous and dependency-free, so the same call produces the same
 * bytes in Node, a browser, a Cloudflare Worker, Deno and Bun. Nothing here
 * touches a canvas.
 */

import { zlibDeflate } from './deflate.js';
import {
  DIST_BASE,
  DIST_EXTRA,
  fixedLiteralLengths,
  LENGTH_BASE,
  LENGTH_EXTRA,
  paeth,
} from './deflate-tables.js';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Largest image edge this decoder will accept, in pixels.
 *
 * PNG stores dimensions as unsigned 32-bit, which a hostile file is free to
 * max out. 32768 is far beyond any QR symbol anyone rasterises and still keeps
 * the worst-case allocation to a few gigabytes rather than an impossible one.
 */
const MAX_DIMENSION = 32768;

/** CRC-32 table, built once. PNG appends this over each chunk's type and data. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint32 = (out: Uint8Array, offset: number, value: number): void => {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
};

/** One length-type-data-CRC chunk. */
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(data.length + 12);
  writeUint32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeUint32(out, data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
};

/**
 * Apply PNG's per-scanline filters, picking the one that compresses best.
 *
 * The heuristic is the standard "minimum sum of absolute differences": whichever
 * filter leaves the smallest-magnitude residuals usually deflates smallest.
 * This is worth real money on QR images — the Up filter turns whole bands of
 * identical module rows into runs of zeros, which LZ77 then collapses almost
 * completely.
 */
const filterScanlines = (
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array => {
  const stride = width * channels;
  const out = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  const best = new Uint8Array(stride);

  /** Sum of residual magnitudes, treating bytes as signed: 255 is -1, not 255. */
  const score = (buffer: Uint8Array): number => {
    let total = 0;
    for (let i = 0; i < stride; i++) {
      const value = buffer[i];
      total += value < 128 ? value : 256 - value;
    }
    return total;
  };

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prevRow = row - stride;
    const outRow = y * (stride + 1);

    // A row identical to the one above filters to all zeros under Up, and
    // nothing can beat a score of zero. That is not a rare case here: at any
    // scale above 1 a QR image repeats each module row `scale` times, so seven
    // rows in eight are duplicates at the default scale of 8. Taking them
    // without evaluating five filters across the whole row is most of the win.
    if (y > 0) {
      let identical = true;
      for (let i = 0; i < stride; i++) {
        if (pixels[row + i] !== pixels[prevRow + i]) {
          identical = false;
          break;
        }
      }
      if (identical) {
        // One subtlety, and it is the difference between identical output and
        // merely equivalent output: an all-zero row scores zero under None as
        // well, and the loop below breaks ties towards the lower filter type.
        // Choosing Up there would still encode the same image, but it would
        // change the bytes, and byte-for-byte stability across a refactor is
        // worth more than the branch costs.
        let allZero = true;
        for (let i = 0; i < stride; i++) {
          if (pixels[row + i] !== 0) {
            allZero = false;
            break;
          }
        }
        // `out` is zero-filled, and both filters emit zeros here, so only the
        // type byte needs writing.
        out[outRow] = allZero ? 0 : 2;
        continue;
      }
    }

    let bestScore = Number.POSITIVE_INFINITY;
    let bestType = 0;

    // One loop per filter rather than a switch inside a loop over every byte.
    // The switch was re-evaluated `stride * 5` times per row for a value that
    // is constant across the whole pass.
    for (let type = 0; type < 5; type++) {
      if (type === 0) {
        for (let i = 0; i < stride; i++) candidate[i] = pixels[row + i];
      } else if (type === 1) {
        for (let i = 0; i < channels; i++) candidate[i] = pixels[row + i] & 0xff;
        for (let i = channels; i < stride; i++) {
          candidate[i] = (pixels[row + i] - pixels[row + i - channels]) & 0xff;
        }
      } else if (type === 2) {
        if (y === 0) for (let i = 0; i < stride; i++) candidate[i] = pixels[row + i];
        else
          for (let i = 0; i < stride; i++)
            candidate[i] = (pixels[row + i] - pixels[prevRow + i]) & 0xff;
      } else if (type === 3) {
        for (let i = 0; i < stride; i++) {
          const left = i >= channels ? pixels[row + i - channels] : 0;
          const up = y > 0 ? pixels[prevRow + i] : 0;
          candidate[i] = (pixels[row + i] - ((left + up) >> 1)) & 0xff;
        }
      } else {
        for (let i = 0; i < stride; i++) {
          const left = i >= channels ? pixels[row + i - channels] : 0;
          const up = y > 0 ? pixels[prevRow + i] : 0;
          const upLeft = y > 0 && i >= channels ? pixels[prevRow + i - channels] : 0;
          candidate[i] = (pixels[row + i] - paeth(left, up, upLeft)) & 0xff;
        }
      }

      const total = score(candidate);
      if (total < bestScore) {
        bestScore = total;
        bestType = type;
        best.set(candidate);
      }
    }

    out[outRow] = bestType;
    out.set(best, outRow + 1);
  }

  return out;
};

export interface PngOptions {
  /**
   * DEFLATE effort, 0-9. Higher is smaller and slower; the difference on a QR
   * bitmap between 6 and 9 is usually under a percent.
   */
  level?: number;
  /** Physical resolution, written as a `pHYs` chunk so print tools size it correctly. */
  dpi?: number;
}

/**
 * Encode 8-bit RGBA pixels as a PNG.
 *
 * `pixels` is row-major `width * height * 4`, non-premultiplied, exactly as a
 * canvas `ImageData` would hold it.
 */
export const encodePng = (
  pixels: Uint8Array,
  width: number,
  height: number,
  options: PngOptions = {},
): Uint8Array => {
  const { level = 6, dpi } = options;
  if (pixels.length !== width * height * 4) {
    throw new RangeError(
      `Pixel buffer is ${pixels.length} bytes, expected ${width * height * 4} for ${width}x${height} RGBA`,
    );
  }

  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type 6: truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const chunks: Uint8Array[] = [SIGNATURE, chunk('IHDR', header)];

  if (dpi !== undefined) {
    // pHYs stores pixels per metre; 1 inch is 0.0254 m.
    const perMetre = Math.round(dpi / 0.0254);
    const phys = new Uint8Array(9);
    writeUint32(phys, 0, perMetre);
    writeUint32(phys, 4, perMetre);
    phys[8] = 1; // unit: metres
    chunks.push(chunk('pHYs', phys));
  }

  const filtered = filterScanlines(pixels, width, height, 4);
  chunks.push(chunk('IDAT', zlibDeflate(filtered, level)));
  chunks.push(chunk('IEND', new Uint8Array(0)));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

/** Samples per pixel for each PNG colour type. Absent keys are not valid types. */
const CHANNELS_FOR_COLOUR: Readonly<Record<number, number>> = {
  0: 1, // greyscale
  2: 3, // truecolour
  3: 1, // palette index
  4: 2, // greyscale + alpha
  6: 4, // truecolour + alpha
};

/**
 * Bit depths each colour type may use, per ISO/IEC 15948 table 11.1.
 *
 * The pairing matters: a palette index is never 16 bits, and truecolour is
 * never sub-byte. Checking the combination rather than each field separately
 * rejects headers that are individually plausible but jointly impossible.
 */
const DEPTHS_FOR_COLOUR: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/**
 * The seven Adam7 interlace passes as `[xStart, yStart, xStep, yStep]`.
 *
 * Each pass is a complete, independently filtered sub-image sampled on its own
 * lattice, which is why the filter state resets at every pass boundary rather
 * than running through the file.
 */
const ADAM7: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** Multiplier that widens a sub-byte sample to the full 0-255 range. */
const WIDEN: Readonly<Record<number, number>> = { 1: 255, 2: 85, 4: 17, 8: 1 };

/**
 * Decode a PNG to RGBA pixels.
 *
 * Covers the whole of the PNG colour model — greyscale, truecolour, palette
 * and both alpha variants, at every bit depth each allows, interlaced or not,
 * honouring `tRNS` transparency. That breadth is not gold-plating: {@link scan}
 * accepts images from anywhere, and a black-and-white QR code is exactly the
 * kind of image encoders and optimisers store as 1-bit palette or greyscale
 * rather than as RGBA. A decoder that read back only what {@link encodePng}
 * writes would reject most QR PNGs in existence.
 *
 * Sub-byte samples are widened to 8 bits and 16-bit samples are truncated to
 * their high byte, so the result is always 8-bit RGBA regardless of the source.
 */
export const decodePng = (
  bytes: Uint8Array,
): { pixels: Uint8Array; width: number; height: number } => {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG (bad signature)');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let colour = 6;
  let interlaced = false;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  const readUint32 = (at: number): number =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  let sawHeader = false;

  // A chunk header is 8 bytes and its trailer 4, so anything claiming to start
  // within 12 bytes of the end cannot be a chunk.
  while (offset + 12 <= bytes.length) {
    const length = readUint32(offset);
    // A chunk that runs past the buffer is malformed. Without this the
    // subarray below silently truncates and the walk marches off the end.
    if (offset + 12 + length > bytes.length) {
      throw new Error('Truncated PNG: chunk runs past the end of the buffer');
    }
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      if (length < 13) throw new Error('Truncated PNG: IHDR is too short');
      width = readUint32(offset + 8);
      height = readUint32(offset + 12);
      // Dimensions are read as unsigned 32-bit, so a hostile header can claim
      // billions of pixels. Rejecting up front matters more than it looks:
      // width * height * 4 is what gets allocated, and 2^31 squared overflows
      // into a number no allocation can serve.
      if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
        throw new Error(`PNG dimensions out of range: ${width}x${height}`);
      }
      depth = data[8];
      colour = data[9];
      const allowed = DEPTHS_FOR_COLOUR[colour];
      if (!allowed) throw new Error(`Unsupported colour type: ${colour}`);
      if (!allowed.includes(depth)) {
        throw new Error(`Unsupported bit depth ${depth} for colour type ${colour}`);
      }
      if (data[10] !== 0) throw new Error(`Unsupported compression method: ${data[10]}`);
      if (data[11] !== 0) throw new Error(`Unsupported filter method: ${data[11]}`);
      if (data[12] > 1) throw new Error(`Unsupported interlace method: ${data[12]}`);
      interlaced = data[12] === 1;
      sawHeader = true;
    } else if (type === 'PLTE') {
      palette = data.slice();
    } else if (type === 'tRNS') {
      transparency = data.slice();
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += length + 12;
  }

  if (!sawHeader) throw new Error('Not a PNG (no IHDR chunk)');
  if (idat.length === 0) throw new Error('PNG has no image data');
  if (colour === 3 && !palette) throw new Error('Palette PNG has no PLTE chunk');

  const merged = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let at = 0;
  for (const d of idat) {
    merged.set(d, at);
    at += d.length;
  }

  const samples = CHANNELS_FOR_COLOUR[colour];
  const bitsPerPixel = samples * depth;
  // The filter's "corresponding byte in the previous pixel" step, which the
  // spec rounds up to one byte. Sub-byte formats therefore filter bytewise.
  const unit = Math.max(1, bitsPerPixel >> 3);
  const strideOf = (pixelsWide: number): number => Math.ceil((bitsPerPixel * pixelsWide) / 8);

  const passes = interlaced ? ADAM7 : ([[0, 0, 1, 1]] as const);
  const layout = passes.map(([xStart, yStart, xStep, yStep]) => {
    const pixelsWide = Math.ceil((width - xStart) / xStep);
    const rows = Math.ceil((height - yStart) / yStep);
    return { xStart, yStart, xStep, yStep, pixelsWide, rows, stride: strideOf(pixelsWide) };
  });

  // The bound the inflater is held to: one filter byte plus a row of samples,
  // for every row of every pass. A valid stream produces exactly this; anything
  // claiming more is either corrupt or deliberately expanding.
  let expected = 0;
  for (const pass of layout) {
    if (pass.pixelsWide > 0 && pass.rows > 0) expected += pass.rows * (pass.stride + 1);
  }

  const raw = inflateZlib(merged, expected);
  // Reading short would not hang — past the end a typed array yields
  // `undefined`, which coerces to zero — it would quietly invent grey pixels.
  // Truncated input should say so rather than decode to plausible nonsense.
  if (raw.length < expected) throw new Error('Truncated PNG: image data is shorter than declared');

  const pixels = new Uint8Array(width * height * 4);
  const maxSample = depth === 16 ? 0xffff : (1 << depth) - 1;

  // tRNS stores its key at 16 bits regardless of depth; only the low bits are
  // significant, so mask before comparing against a sample read at depth.
  //
  // The length check is not pedantry. A tRNS too short for its colour type
  // would read `undefined` past its end, which coerces to zero — silently
  // keying out *black*, the one value a QR code cannot afford to lose. A
  // malformed chunk is better ignored than half-read.
  const keyBytes = colour === 0 ? 2 : 6;
  const keyed =
    transparency !== null && (colour === 0 || colour === 2) && transparency.length >= keyBytes;
  const key = (index: number): number =>
    (((transparency as Uint8Array)[index * 2] << 8) | (transparency as Uint8Array)[index * 2 + 1]) &
    maxSample;
  const keyGrey = keyed && colour === 0 ? key(0) : -1;
  const keyRed = keyed && colour === 2 ? key(0) : -1;
  const keyGreen = keyed && colour === 2 ? key(1) : -1;
  const keyBlue = keyed && colour === 2 ? key(2) : -1;

  const widen = (value: number): number => (depth === 16 ? value >> 8 : value * WIDEN[depth]);

  let cursor = 0;

  for (const pass of layout) {
    if (pass.pixelsWide <= 0 || pass.rows <= 0) continue;
    const { stride } = pass;
    const line = new Uint8Array(stride);
    const prev = new Uint8Array(stride);

    // Sample `index` of the current row, at the image's native bit depth.
    const sampleAt = (index: number): number => {
      if (depth === 8) return line[index];
      if (depth === 16) return (line[index * 2] << 8) | line[index * 2 + 1];
      const bit = index * depth;
      return (line[bit >> 3] >> (8 - depth - (bit & 7))) & maxSample;
    };

    for (let row = 0; row < pass.rows; row++) {
      const filter = raw[cursor];
      const src = cursor + 1;
      for (let i = 0; i < stride; i++) {
        const value = raw[src + i];
        const left = i >= unit ? line[i - unit] : 0;
        const up = prev[i];
        const upLeft = i >= unit ? prev[i - unit] : 0;
        let out: number;
        switch (filter) {
          case 1:
            out = value + left;
            break;
          case 2:
            out = value + up;
            break;
          case 3:
            out = value + ((left + up) >> 1);
            break;
          case 4:
            out = value + paeth(left, up, upLeft);
            break;
          default:
            out = value;
        }
        line[i] = out & 0xff;
      }
      cursor += stride + 1;

      const y = pass.yStart + row * pass.yStep;
      for (let col = 0; col < pass.pixelsWide; col++) {
        const d = (y * width + pass.xStart + col * pass.xStep) * 4;
        const base = col * samples;

        if (colour === 3) {
          const entry = sampleAt(base);
          const plte = palette as Uint8Array;
          const index = entry * 3;
          // A bit depth admits more indices than the palette need define, so an
          // out-of-range index is a property of the file, not of this reader.
          if (index + 3 > plte.length) throw new Error('PNG palette index out of range');
          pixels[d] = plte[index];
          pixels[d + 1] = plte[index + 1];
          pixels[d + 2] = plte[index + 2];
          // tRNS on a palette image lists alpha per entry, and may stop early;
          // every entry it does not reach is opaque.
          pixels[d + 3] = transparency && entry < transparency.length ? transparency[entry] : 0xff;
          continue;
        }

        if (colour === 0 || colour === 4) {
          const grey = sampleAt(base);
          const value = widen(grey);
          pixels[d] = value;
          pixels[d + 1] = value;
          pixels[d + 2] = value;
          pixels[d + 3] = colour === 4 ? widen(sampleAt(base + 1)) : grey === keyGrey ? 0 : 0xff;
          continue;
        }

        const red = sampleAt(base);
        const green = sampleAt(base + 1);
        const blue = sampleAt(base + 2);
        pixels[d] = widen(red);
        pixels[d + 1] = widen(green);
        pixels[d + 2] = widen(blue);
        pixels[d + 3] =
          colour === 6
            ? widen(sampleAt(base + 3))
            : red === keyRed && green === keyGreen && blue === keyBlue
              ? 0
              : 0xff;
      }

      prev.set(line);
    }
  }

  return { pixels, width, height };
};

/**
 * Minimal INFLATE, enough to read back what {@link encodePng} writes plus the
 * dynamic-Huffman streams other encoders produce.
 */
const inflateZlib = (input: Uint8Array, maxOutput = Number.POSITIVE_INFINITY): Uint8Array => {
  // Skip the two-byte zlib header; the Adler trailer is not checked here
  // because the PNG CRC already covers the chunk.
  let pos = 2;
  let bitBuffer = 0;
  let bitCount = 0;
  const out: number[] = [];

  const bits = (count: number): number => {
    while (bitCount < count) {
      // Reading past the end must fail, not quietly yield zeros.
      //
      // `input[pos]` is `undefined` beyond the buffer and `undefined << n` is
      // `0`, so without this check the reader hands back an endless stream of
      // zero bits — which the loops below happily consume forever, growing
      // `out` as they go. A truncated PNG then hangs the process instead of
      // throwing, and since this is reached straight from `scan()`, that is a
      // denial of service on any caller handling images it did not create.
      if (pos >= input.length) throw new Error('Truncated PNG stream');
      bitBuffer |= input[pos++] << bitCount;
      bitCount += 8;
    }
    const value = bitBuffer & ((1 << count) - 1);
    bitBuffer >>>= count;
    bitCount -= count;
    return value;
  };

  /**
   * Refuse to inflate more than the image could possibly need.
   *
   * A second backstop behind the bounds check above: a *malicious* stream can
   * be perfectly well-formed and still expand without limit, and no amount of
   * input validation catches that. The caller knows how many bytes a valid
   * image would produce, so anything beyond it is not worth allocating.
   */
  const guardOutput = (): void => {
    if (out.length > maxOutput) throw new Error('PNG stream expands beyond its declared size');
  };

  /** Build a canonical Huffman decode table from code lengths. */
  const buildTree = (lengths: number[]) => {
    const maxBits = Math.max(...lengths);
    const blCount = new Array<number>(maxBits + 1).fill(0);
    for (const l of lengths) if (l > 0) blCount[l]++;
    const nextCode = new Array<number>(maxBits + 2).fill(0);
    let code = 0;
    for (let b = 1; b <= maxBits; b++) {
      code = (code + blCount[b - 1]) << 1;
      nextCode[b] = code;
    }
    const map = new Map<string, number>();
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i];
      if (l > 0) map.set(`${l}:${nextCode[l]++}`, i);
    }
    return { map, maxBits };
  };

  const decodeSymbol = (tree: ReturnType<typeof buildTree>): number => {
    let code = 0;
    for (let l = 1; l <= tree.maxBits; l++) {
      code = (code << 1) | bits(1);
      const symbol = tree.map.get(`${l}:${code}`);
      if (symbol !== undefined) return symbol;
    }
    throw new Error('Invalid Huffman code in PNG stream');
  };

  for (;;) {
    const final = bits(1);
    const type = bits(2);

    if (type === 0) {
      // Stored: realign to a byte boundary, then copy verbatim.
      bitBuffer = 0;
      bitCount = 0;
      const length = input[pos] | (input[pos + 1] << 8);
      pos += 4;
      if (pos + length > input.length) throw new Error('Truncated PNG stream');
      for (let i = 0; i < length; i++) out.push(input[pos++]);
      guardOutput();
    } else {
      let literalTree: ReturnType<typeof buildTree>;
      let distanceTree: ReturnType<typeof buildTree>;

      if (type === 1) {
        literalTree = buildTree(fixedLiteralLengths());
        distanceTree = buildTree(new Array<number>(30).fill(5));
      } else {
        const hlit = bits(5) + 257;
        const hdist = bits(5) + 1;
        const hclen = bits(4) + 4;
        const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const clLengths = new Array<number>(19).fill(0);
        for (let i = 0; i < hclen; i++) clLengths[order[i]] = bits(3);
        const clTree = buildTree(clLengths);

        const lengths: number[] = [];
        while (lengths.length < hlit + hdist) {
          const symbol = decodeSymbol(clTree);
          if (symbol < 16) lengths.push(symbol);
          else if (symbol === 16) {
            const repeat = 3 + bits(2);
            const last = lengths[lengths.length - 1];
            for (let i = 0; i < repeat; i++) lengths.push(last);
          } else if (symbol === 17) {
            const repeat = 3 + bits(3);
            for (let i = 0; i < repeat; i++) lengths.push(0);
          } else {
            const repeat = 11 + bits(7);
            for (let i = 0; i < repeat; i++) lengths.push(0);
          }
        }
        literalTree = buildTree(lengths.slice(0, hlit));
        distanceTree = buildTree(lengths.slice(hlit));
      }

      for (;;) {
        const symbol = decodeSymbol(literalTree);
        if (symbol === 256) break;
        if (symbol < 256) {
          out.push(symbol);
          guardOutput();
        } else {
          const li = symbol - 257;
          const length = LENGTH_BASE[li] + bits(LENGTH_EXTRA[li]);
          const di = decodeSymbol(distanceTree);
          const distance = DIST_BASE[di] + bits(DIST_EXTRA[di]);
          const from = out.length - distance;
          // A back-reference before the start of the stream is malformed; copying
          // it would splice `undefined` into the output and corrupt the image.
          if (from < 0) throw new Error('Invalid back-reference in PNG stream');
          for (let i = 0; i < length; i++) out.push(out[from + i]);
          guardOutput();
        }
      }
    }

    if (final) break;
  }

  return Uint8Array.from(out);
};

export { inflateZlib };
