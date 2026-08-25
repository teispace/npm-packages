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

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prevRow = row - stride;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestType = 0;

    for (let type = 0; type < 5; type++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const raw = pixels[row + i];
        const left = i >= channels ? pixels[row + i - channels] : 0;
        const up = y > 0 ? pixels[prevRow + i] : 0;
        const upLeft = y > 0 && i >= channels ? pixels[prevRow + i - channels] : 0;

        let value: number;
        switch (type) {
          case 1:
            value = raw - left;
            break;
          case 2:
            value = raw - up;
            break;
          case 3:
            value = raw - ((left + up) >> 1);
            break;
          case 4:
            value = raw - paeth(left, up, upLeft);
            break;
          default:
            value = raw;
        }
        value &= 0xff;
        candidate[i] = value;
        // Treat bytes as signed when scoring: 255 is a residual of -1, not 255.
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        best.set(candidate);
      }
    }

    out[y * (stride + 1)] = bestType;
    out.set(best, y * (stride + 1) + 1);
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

/**
 * Decode a PNG this library produced, back to RGBA pixels.
 *
 * Deliberately narrow: it handles 8-bit RGB and RGBA, non-interlaced, which is
 * everything {@link encodePng} emits. It exists so the verifier can read back
 * a rendered symbol and prove it still decodes, without pulling in a general
 * image library.
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
  let channels = 4;
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
      if (data[8] !== 8) throw new Error(`Unsupported bit depth: ${data[8]}`);
      if (data[9] === 2) channels = 3;
      else if (data[9] === 6) channels = 4;
      else throw new Error(`Unsupported colour type: ${data[9]}`);
      if (data[12] !== 0) throw new Error('Interlaced PNG is not supported');
      sawHeader = true;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += length + 12;
  }

  if (!sawHeader) throw new Error('Not a PNG (no IHDR chunk)');
  if (idat.length === 0) throw new Error('PNG has no image data');

  const merged = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let at = 0;
  for (const d of idat) {
    merged.set(d, at);
    at += d.length;
  }

  // The bound the inflater is held to: one filter byte plus a row of samples,
  // for each declared row. A valid stream produces exactly this; anything
  // claiming more is either corrupt or deliberately expanding.
  const raw = inflateZlib(merged, (width * channels + 1) * height);
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const value = raw[src + i];
      const left = i >= channels ? line[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let out: number;
      switch (type) {
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
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      pixels[d] = line[s];
      pixels[d + 1] = line[s + 1];
      pixels[d + 2] = line[s + 2];
      pixels[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev.set(line);
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
