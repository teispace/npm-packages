/**
 * Baseline JPEG decoding (ITU-T T.81, ISO/IEC 10918-1).
 *
 * Synchronous and dependency-free like the rest of this package, so a photo
 * decodes identically in Node, a Worker, Deno and Bun without a canvas or an
 * `await`. It exists because a camera produces JPEG: a scanner that can only
 * read PNG can read what a website served, never what a phone shot.
 *
 * ### What is covered
 * Huffman-coded JPEG in all three of its structures: baseline (SOF0), extended
 * sequential (SOF1) and **progressive** (SOF2). Greyscale and YCbCr, every
 * chroma subsampling the format allows, 8- and 16-bit quantisation tables,
 * restart intervals, and Adobe's APP14 transform flag for the files that store
 * RGB directly.
 *
 * Progressive matters more than its share of cameras suggests: it is what a
 * great deal of the web serves, and a scanner is usually pointed at an image
 * that came from somewhere. Its coefficients arrive across several scans, split
 * by spectral band and by bit position, so a block is only complete once the
 * last scan has run — which is why nothing is reconstructed until every scan is
 * read.
 *
 * Arithmetic coding (SOF9/SOF10) is refused by name; it is legal,
 * patent-encumbered in practice, and essentially unused. So are the lossless,
 * differential and hierarchical modes.
 */

/** Largest edge accepted, matching the PNG decoder's bound for the same reason. */
const MAX_DIMENSION = 32768;

/** JPEG stores coefficients in zig-zag order; this maps that to raster order. */
const ZIGZAG = Uint8Array.from([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

/**
 * Separable 8-point inverse DCT basis, precomputed.
 *
 * `BASIS[u * 8 + x]` is `C(u)/2 * cos((2x+1)uπ/16)`. A float IDCT applied to
 * rows then columns is roughly a thousand multiplies per block, which is
 * nothing against the Huffman pass, and it is transparently the transform the
 * specification defines rather than one of the fast approximations whose
 * rounding has to be argued about.
 */
const BASIS = (() => {
  const table = new Float32Array(64);
  for (let u = 0; u < 8; u++) {
    const scale = (u === 0 ? Math.SQRT1_2 : 1) / 2;
    for (let x = 0; x < 8; x++) {
      table[u * 8 + x] = scale * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
  }
  return table;
})();

/** A canonical Huffman table, in the decode-by-length form T.81 describes. */
interface HuffmanTable {
  /** Smallest code of each length, indexed 1-16. */
  readonly minCode: Int32Array;
  /** Largest code of each length, or -1 when no code has that length. */
  readonly maxCode: Int32Array;
  /** Index into `values` of the first code of each length. */
  readonly valPtr: Int32Array;
  readonly values: Uint8Array;
}

/**
 * Build the decoding tables from a DHT chunk's `BITS` counts and values.
 *
 * Canonical Huffman codes are fully determined by how many codes exist at each
 * length, so the table is three small arrays rather than a tree: read one bit
 * at a time, and a code is complete as soon as it stops exceeding `maxCode`
 * for its length.
 */
const buildHuffmanTable = (counts: Uint8Array, values: Uint8Array): HuffmanTable => {
  const minCode = new Int32Array(17);
  const maxCode = new Int32Array(17).fill(-1);
  const valPtr = new Int32Array(17);

  let code = 0;
  let index = 0;
  for (let length = 1; length <= 16; length++) {
    if (counts[length - 1] === 0) {
      maxCode[length] = -1;
      code <<= 1;
      continue;
    }
    valPtr[length] = index;
    minCode[length] = code;
    code += counts[length - 1];
    index += counts[length - 1];
    maxCode[length] = code - 1;
    code <<= 1;
  }

  return { minCode, maxCode, valPtr, values };
};

interface Component {
  readonly id: number;
  /** Horizontal and vertical sampling factors. */
  readonly h: number;
  readonly v: number;
  readonly quantId: number;
  blocksPerLine: number;
  blocksPerColumn: number;
  coefficients: Int16Array;
  dcTable: number;
  acTable: number;
  /** DC predictor, reset at every restart interval. */
  pred: number;
  /** Decoded samples, `blocksPerLine * 8` wide. */
  samples: Uint8ClampedArray;
}

/** Whether these bytes start with a JPEG SOI marker. */
export const isJpeg = (bytes: Uint8Array): boolean =>
  bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

/**
 * Decode a JPEG to 8-bit RGBA pixels.
 *
 * Alpha is always 255: JPEG has no transparency.
 */
export const decodeJpeg = (
  bytes: Uint8Array,
): { pixels: Uint8Array; width: number; height: number } => {
  if (!isJpeg(bytes)) throw new Error('Not a JPEG (bad SOI marker)');

  const quantTables: (Int32Array | null)[] = [null, null, null, null];
  const dcTables: (HuffmanTable | null)[] = [null, null, null, null];
  const acTables: (HuffmanTable | null)[] = [null, null, null, null];

  let frame: {
    width: number;
    height: number;
    components: Component[];
    maxH: number;
    maxV: number;
    mcusPerLine: number;
    mcusPerColumn: number;
  } | null = null;
  let restartInterval = 0;
  /** Adobe APP14 colour transform: -1 when absent, else 0 = none, 1 = YCbCr. */
  let adobeTransform = -1;
  /** SOF2: coefficients arrive across several scans rather than all at once. */
  let progressive = false;

  let offset = 2;

  const readUint16 = (at: number): number => {
    if (at + 1 >= bytes.length) throw new Error('Truncated JPEG');
    return (bytes[at] << 8) | bytes[at + 1];
  };

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Fill bytes are legal between segments; anything else is corruption.
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;

    // Standalone markers carry no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) break; // EOI

    const length = readUint16(offset);
    if (length < 2 || offset + length > bytes.length) {
      throw new Error('Truncated JPEG: segment runs past the end of the buffer');
    }
    const segment = bytes.subarray(offset + 2, offset + length);

    switch (marker) {
      case 0xdb: {
        // DQT. One segment may carry several tables, each prefixed with its
        // precision in the high nibble and its slot in the low one.
        let at = 0;
        while (at < segment.length) {
          const precision = segment[at] >> 4;
          const slot = segment[at] & 15;
          at++;
          if (slot > 3) throw new Error(`Invalid quantisation table slot: ${slot}`);
          const table = new Int32Array(64);
          for (let i = 0; i < 64; i++) {
            const z = ZIGZAG[i];
            if (precision) {
              table[z] = (segment[at] << 8) | segment[at + 1];
              at += 2;
            } else {
              table[z] = segment[at];
              at++;
            }
          }
          quantTables[slot] = table;
        }
        break;
      }

      case 0xc0:
      case 0xc1:
      case 0xc2: {
        // SOF0 baseline / SOF1 extended sequential / SOF2 progressive. All
        // three are Huffman-coded and share this header exactly; they differ
        // only in how the scans that follow are structured.
        progressive = marker === 0xc2;
        if (frame) throw new Error('JPEG has more than one frame');
        if (segment[0] !== 8) throw new Error(`Unsupported sample precision: ${segment[0]}`);
        const height = (segment[1] << 8) | segment[2];
        const width = (segment[3] << 8) | segment[4];
        if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
          throw new Error(`JPEG dimensions out of range: ${width}x${height}`);
        }
        const count = segment[5];
        if (count !== 1 && count !== 3) {
          throw new Error(
            count === 4
              ? 'CMYK JPEG is not supported; convert to RGB first'
              : `Unsupported component count: ${count}`,
          );
        }

        const components: Component[] = [];
        let maxH = 1;
        let maxV = 1;
        for (let i = 0; i < count; i++) {
          const at = 6 + i * 3;
          const h = segment[at + 1] >> 4;
          const v = segment[at + 1] & 15;
          if (h < 1 || h > 4 || v < 1 || v > 4) {
            throw new Error(`Invalid sampling factors: ${h}x${v}`);
          }
          maxH = Math.max(maxH, h);
          maxV = Math.max(maxV, v);
          components.push({
            id: segment[at],
            h,
            v,
            quantId: segment[at + 2],
            blocksPerLine: 0,
            blocksPerColumn: 0,
            coefficients: new Int16Array(0),
            dcTable: 0,
            acTable: 0,
            pred: 0,
            samples: new Uint8ClampedArray(0),
          });
        }

        const mcusPerLine = Math.ceil(width / (8 * maxH));
        const mcusPerColumn = Math.ceil(height / (8 * maxV));
        for (const component of components) {
          // Each component is padded out to whole MCUs, which is why these are
          // derived from the MCU count rather than from the image size.
          component.blocksPerLine = mcusPerLine * component.h;
          component.blocksPerColumn = mcusPerColumn * component.v;
          component.coefficients = new Int16Array(
            component.blocksPerLine * component.blocksPerColumn * 64,
          );
        }

        frame = { width, height, components, maxH, maxV, mcusPerLine, mcusPerColumn };
        break;
      }

      case 0xc9:
      case 0xca:
        throw new Error('Arithmetic-coded JPEG is not supported');
      case 0xc3:
      case 0xc5:
      case 0xc6:
      case 0xc7:
      case 0xcb:
      case 0xcd:
      case 0xce:
      case 0xcf:
        throw new Error(`Unsupported JPEG frame type: SOF${marker - 0xc0}`);

      case 0xc4: {
        // DHT, again possibly several tables per segment.
        let at = 0;
        while (at < segment.length) {
          const kind = segment[at] >> 4;
          const slot = segment[at] & 15;
          at++;
          if (slot > 3) throw new Error(`Invalid Huffman table slot: ${slot}`);
          const counts = segment.subarray(at, at + 16);
          at += 16;
          let total = 0;
          for (let i = 0; i < 16; i++) total += counts[i];
          const values = segment.subarray(at, at + total);
          at += total;
          const table = buildHuffmanTable(counts, values);
          if (kind === 0) dcTables[slot] = table;
          else acTables[slot] = table;
        }
        break;
      }

      case 0xdd:
        restartInterval = (segment[0] << 8) | segment[1];
        break;

      case 0xee:
        // APP14. Adobe's marker carries the colour transform in its last byte,
        // and it is the only reliable way to know that a three-component file
        // holds RGB rather than YCbCr.
        if (
          segment.length >= 12 &&
          segment[0] === 0x41 &&
          segment[1] === 0x64 &&
          segment[2] === 0x6f &&
          segment[3] === 0x62 &&
          segment[4] === 0x65
        ) {
          adobeTransform = segment[segment.length - 1];
        }
        break;

      case 0xda: {
        if (!frame) throw new Error('JPEG scan before frame header');
        const count = segment[0];
        const scan: Component[] = [];
        for (let i = 0; i < count; i++) {
          const id = segment[1 + i * 2];
          const component = frame.components.find((c) => c.id === id);
          if (!component) throw new Error(`Scan names unknown component ${id}`);
          component.dcTable = segment[2 + i * 2] >> 4;
          component.acTable = segment[2 + i * 2] & 15;
          scan.push(component);
        }
        // Spectral selection and successive approximation. A baseline scan
        // always carries 0/63/0/0, so the same fields drive both paths and
        // there is no second code path to keep in step.
        const spectralStart = segment[1 + count * 2];
        const spectralEnd = segment[2 + count * 2];
        const approximation = segment[3 + count * 2];
        offset = decodeScan(bytes, offset + length, frame, scan, dcTables, acTables, {
          restartInterval,
          progressive,
          spectralStart,
          spectralEnd,
          approximationHigh: approximation >> 4,
          approximationLow: approximation & 15,
        });
        continue;
      }

      default:
        break; // APPn, COM and anything else carrying no decoding state.
    }

    offset += length;
  }

  if (!frame) throw new Error('JPEG has no frame header');

  for (const component of frame.components) {
    const quant = quantTables[component.quantId];
    if (!quant) throw new Error(`Missing quantisation table ${component.quantId}`);
    component.samples = reconstruct(component, quant);
  }

  return toRgba(frame, adobeTransform);
};

/** Spectral selection and successive approximation for one scan. */
interface ScanParameters {
  readonly restartInterval: number;
  readonly progressive: boolean;
  /** First and last coefficient of the band this scan carries, in zig-zag order. */
  readonly spectralStart: number;
  readonly spectralEnd: number;
  /** Bit position already sent (0 on a first pass) and the one being sent now. */
  readonly approximationHigh: number;
  readonly approximationLow: number;
}

/**
 * Read one entropy-coded segment, filling every component's coefficient array.
 *
 * Baseline sends every coefficient of a block in one pass. Progressive sends
 * bands of coefficients across several scans, and sends each band's bits from
 * the most significant downwards, so a block is only complete once the last
 * scan has run. Both funnel through here because they share the bit reader,
 * the Huffman walk and the restart handling — only what happens per block
 * differs.
 *
 * Returns the offset of the marker that ended the scan.
 */
const decodeScan = (
  bytes: Uint8Array,
  start: number,
  frame: {
    width: number;
    height: number;
    components: Component[];
    mcusPerLine: number;
    mcusPerColumn: number;
    maxH: number;
    maxV: number;
  },
  scan: Component[],
  dcTables: (HuffmanTable | null)[],
  acTables: (HuffmanTable | null)[],
  parameters: ScanParameters,
): number => {
  const {
    restartInterval,
    progressive,
    spectralStart,
    spectralEnd,
    approximationHigh,
    approximationLow,
  } = parameters;

  let offset = start;
  let bitBuffer = 0;
  let bitCount = 0;
  /** Set when the reader reaches a marker, so the scan stops rather than eating it. */
  let atMarker = false;
  /**
   * Blocks left to skip because an end-of-band run said they are all zero.
   *
   * Progressive AC scans code long stretches of empty bands as a single run,
   * which is most of where their compression comes from.
   */
  let eobrun = 0;

  const nextBit = (): number => {
    if (bitCount === 0) {
      if (offset >= bytes.length) {
        // Running out mid-symbol is corruption, not a hang: feeding zeros
        // would loop forever inside the Huffman walk below.
        atMarker = true;
        return 0;
      }
      let byte = bytes[offset++];
      if (byte === 0xff) {
        const next = bytes[offset];
        if (next === 0x00) {
          // Stuffed byte: a literal 0xFF in the entropy stream.
          offset++;
        } else if (next === 0xff) {
          // Fill byte; leave it for the next read.
          byte = 0xff;
        } else {
          // A real marker. Step back so the caller sees it.
          offset--;
          atMarker = true;
          return 0;
        }
      }
      bitBuffer = byte;
      bitCount = 8;
    }
    bitCount--;
    return (bitBuffer >> bitCount) & 1;
  };

  const decodeHuffman = (table: HuffmanTable | null): number => {
    if (!table) throw new Error('JPEG scan uses an undefined Huffman table');
    let code = nextBit();
    for (let length = 1; length <= 16; length++) {
      if (table.maxCode[length] >= 0 && code <= table.maxCode[length]) {
        return table.values[table.valPtr[length] + code - table.minCode[length]];
      }
      code = (code << 1) | nextBit();
      if (atMarker) return 0;
    }
    throw new Error('Invalid Huffman code in JPEG scan');
  };

  /** Read `n` raw bits as an unsigned value. */
  const receive = (n: number): number => {
    let value = 0;
    for (let i = 0; i < n; i++) value = (value << 1) | nextBit();
    return value;
  };

  /** T.81's EXTEND: turn an `n`-bit magnitude into a signed coefficient. */
  const extend = (value: number, n: number): number =>
    n === 0 ? 0 : value < 1 << (n - 1) ? value - (1 << n) + 1 : value;

  /** Baseline: every coefficient of the block, in one pass. */
  const decodeBaseline = (component: Component, at: number): void => {
    const dcLength = decodeHuffman(dcTables[component.dcTable]);
    const diff = dcLength === 0 ? 0 : extend(receive(dcLength), dcLength);
    component.pred += diff;
    component.coefficients[at] = component.pred;

    let k = 1;
    while (k < 64) {
      const rs = decodeHuffman(acTables[component.acTable]);
      const size = rs & 15;
      const run = rs >> 4;
      if (size === 0) {
        if (run < 15) break; // EOB
        k += 16; // ZRL: sixteen zeroes
        continue;
      }
      k += run;
      if (k > 63) break;
      component.coefficients[at + ZIGZAG[k]] = extend(receive(size), size);
      k++;
    }
  };

  /** Progressive DC, first pass: the top bits of the DC coefficient. */
  const decodeDcFirst = (component: Component, at: number): void => {
    const dcLength = decodeHuffman(dcTables[component.dcTable]);
    const diff = dcLength === 0 ? 0 : extend(receive(dcLength), dcLength);
    component.pred += diff;
    component.coefficients[at] = component.pred << approximationLow;
  };

  /** Progressive DC, refinement: one more bit of a coefficient already sent. */
  const decodeDcRefine = (component: Component, at: number): void => {
    if (nextBit()) component.coefficients[at] |= 1 << approximationLow;
  };

  /** Progressive AC, first pass over a band. */
  const decodeAcFirst = (component: Component, at: number): void => {
    if (eobrun > 0) {
      eobrun--;
      return;
    }
    let k = spectralStart;
    while (k <= spectralEnd) {
      const rs = decodeHuffman(acTables[component.acTable]);
      const size = rs & 15;
      const run = rs >> 4;
      if (size === 0) {
        if (run < 15) {
          // An end-of-band run: this block and the next `2^run - 1` have
          // nothing further in this band.
          eobrun = (1 << run) - 1;
          if (run) eobrun += receive(run);
          break;
        }
        k += 16;
        continue;
      }
      k += run;
      if (k > spectralEnd) break;
      component.coefficients[at + ZIGZAG[k]] =
        extend(receive(size), size) * (1 << approximationLow);
      k++;
    }
  };

  /**
   * Progressive AC, refinement pass.
   *
   * The awkward one. Newly nonzero coefficients arrive interleaved with
   * correction bits for coefficients earlier scans already placed, and the run
   * length counts only the ones that are still zero — so the walk has to step
   * over history without consuming run length for it.
   */
  const decodeAcRefine = (component: Component, at: number): void => {
    const positive = 1 << approximationLow;
    const negative = -1 << approximationLow;
    let k = spectralStart;

    /** Append one correction bit to a coefficient that is already nonzero. */
    const correct = (index: number): void => {
      const current = component.coefficients[index];
      if (current === 0) return;
      if (nextBit() && (current & positive) === 0) {
        component.coefficients[index] = current >= 0 ? current + positive : current + negative;
      }
    };

    if (eobrun <= 0) {
      while (k <= spectralEnd) {
        const rs = decodeHuffman(acTables[component.acTable]);
        const size = rs & 15;
        let run = rs >> 4;
        let value = 0;

        if (size === 0) {
          if (run < 15) {
            eobrun = 1 << run;
            if (run) eobrun += receive(run);
            break;
          }
          // ZRL in a refinement scan still means "sixteen zero-history
          // coefficients", and correction bits are sent for anything nonzero
          // encountered on the way.
        } else {
          value = nextBit() ? positive : negative;
        }

        while (k <= spectralEnd) {
          const index = at + ZIGZAG[k];
          if (component.coefficients[index] !== 0) {
            correct(index);
          } else {
            if (run === 0) {
              if (value !== 0) component.coefficients[index] = value;
              break;
            }
            run--;
          }
          k++;
        }
        k++;
        if (atMarker) return;
      }
    }

    if (eobrun > 0) {
      // Inside an end-of-band run nothing new arrives, but coefficients that
      // are already nonzero still get their correction bit.
      while (k <= spectralEnd) {
        correct(at + ZIGZAG[k]);
        k++;
      }
      eobrun--;
    }
  };

  const decodeBlock = progressive
    ? spectralStart === 0
      ? approximationHigh === 0
        ? decodeDcFirst
        : decodeDcRefine
      : approximationHigh === 0
        ? decodeAcFirst
        : decodeAcRefine
    : decodeBaseline;

  const { mcusPerLine, mcusPerColumn } = frame;

  // A scan naming one component is non-interleaved and walks that component's
  // own block grid; several components interleave into MCUs. Every progressive
  // AC scan is non-interleaved by definition, since a band belongs to one
  // component.
  //
  // The grid is sized from the component's true dimensions, *not* from its
  // MCU-padded `blocksPerLine`. The two agree whenever the component is not
  // subsampled — which is every greyscale file, the common single-scan case —
  // and diverge otherwise, where reading the padded count would consume blocks
  // the encoder never wrote and desynchronise the entropy stream.
  const single = scan.length === 1;
  const blocksWide = single ? Math.ceil(Math.ceil((frame.width * scan[0].h) / frame.maxH) / 8) : 0;
  const blocksHigh = single ? Math.ceil(Math.ceil((frame.height * scan[0].v) / frame.maxV) / 8) : 0;
  const units = single ? blocksWide * blocksHigh : mcusPerLine * mcusPerColumn;
  const perRestart = restartInterval || units;

  let decoded = 0;
  while (decoded < units) {
    for (const component of scan) component.pred = 0;
    // A restart interval resets the end-of-band run as well as the DC
    // predictors: the point of a restart marker is that decoding can resume
    // from it with no carried state at all.
    eobrun = 0;

    const end = Math.min(units, decoded + perRestart);
    for (; decoded < end; decoded++) {
      if (atMarker) break;
      if (single) {
        const component = scan[0];
        const row = Math.floor(decoded / blocksWide);
        const col = decoded % blocksWide;
        // Indexed against the padded stride, since that is how the array was
        // allocated, but walked over the true grid.
        decodeBlock(component, (row * component.blocksPerLine + col) * 64);
      } else {
        const mcuRow = Math.floor(decoded / mcusPerLine);
        const mcuCol = decoded % mcusPerLine;
        for (const component of scan) {
          for (let v = 0; v < component.v; v++) {
            for (let h = 0; h < component.h; h++) {
              const row = mcuRow * component.v + v;
              const col = mcuCol * component.h + h;
              decodeBlock(component, (row * component.blocksPerLine + col) * 64);
            }
          }
        }
      }
    }

    // Realign and consume the restart marker, if one is next.
    bitCount = 0;
    atMarker = false;
    if (offset + 1 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker >= 0xd0 && marker <= 0xd7) offset += 2;
      else break;
    } else if (decoded >= units) {
      break;
    }
  }

  // Hand back the next marker for the caller's loop.
  while (offset + 1 < bytes.length && !(bytes[offset] === 0xff && bytes[offset + 1] !== 0x00)) {
    offset++;
  }
  return offset;
};

/** Dequantise and inverse-transform every block of a component. */
const reconstruct = (component: Component, quant: Int32Array): Uint8ClampedArray => {
  const width = component.blocksPerLine * 8;
  const out = new Uint8ClampedArray(width * component.blocksPerColumn * 8);
  const block = new Float32Array(64);
  const rows = new Float32Array(64);

  for (let by = 0; by < component.blocksPerColumn; by++) {
    for (let bx = 0; bx < component.blocksPerLine; bx++) {
      const at = (by * component.blocksPerLine + bx) * 64;
      for (let i = 0; i < 64; i++) block[i] = component.coefficients[at + i] * quant[i];

      // Rows, then columns. Separating the 2-D transform this way is 8x8x8
      // twice rather than 8x8x8x8 once.
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          let sum = 0;
          for (let u = 0; u < 8; u++) sum += BASIS[u * 8 + x] * block[y * 8 + u];
          rows[y * 8 + x] = sum;
        }
      }
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          let sum = 0;
          for (let v = 0; v < 8; v++) sum += BASIS[v * 8 + y] * rows[v * 8 + x];
          // Samples are stored as signed values centred on zero.
          out[(by * 8 + y) * width + bx * 8 + x] = sum + 128;
        }
      }
    }
  }

  return out;
};

/** Upsample every component to full resolution and convert to RGBA. */
const toRgba = (
  frame: {
    width: number;
    height: number;
    components: Component[];
    maxH: number;
    maxV: number;
  },
  adobeTransform: number,
): { pixels: Uint8Array; width: number; height: number } => {
  const { width, height, components, maxH, maxV } = frame;
  const pixels = new Uint8Array(width * height * 4);

  /** Nearest-neighbour fetch, which is what subsampled chroma is defined as. */
  const sample = (component: Component, x: number, y: number): number => {
    const sx = ((x * component.h) / maxH) | 0;
    const sy = ((y * component.v) / maxV) | 0;
    return component.samples[sy * component.blocksPerLine * 8 + sx];
  };

  // A three-component file is YCbCr unless Adobe says otherwise. Files with no
  // Adobe marker are overwhelmingly JFIF, which is always YCbCr.
  const ycbcr = components.length === 3 && adobeTransform !== 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (components.length === 1) {
        const grey = sample(components[0], x, y);
        pixels[at] = grey;
        pixels[at + 1] = grey;
        pixels[at + 2] = grey;
      } else {
        const a = sample(components[0], x, y);
        const b = sample(components[1], x, y);
        const c = sample(components[2], x, y);
        if (ycbcr) {
          const cb = b - 128;
          const cr = c - 128;
          pixels[at] = clamp(a + 1.402 * cr);
          pixels[at + 1] = clamp(a - 0.344136 * cb - 0.714136 * cr);
          pixels[at + 2] = clamp(a + 1.772 * cb);
        } else {
          pixels[at] = a;
          pixels[at + 1] = b;
          pixels[at + 2] = c;
        }
      }
      pixels[at + 3] = 0xff;
    }
  }

  return { pixels, width, height };
};

const clamp = (value: number): number => (value < 0 ? 0 : value > 255 ? 255 : value | 0);
