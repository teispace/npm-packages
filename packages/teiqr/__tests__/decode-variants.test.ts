import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { encodeMicro, MICRO_LEVELS, MICRO_VERSIONS, type MicroVersion } from '../src/core/micro.js';
import { encodeRmqr, RMQR_VERSIONS, type RmqrLevel, type RmqrVersion } from '../src/core/rmqr.js';
import type { EccLevel } from '../src/core/types.js';
import { decodeMatrix } from '../src/verify/decode-matrix.js';
import { decodeMicroMatrix } from '../src/verify/decode-micro.js';
import { decodeRmqrMatrix } from '../src/verify/decode-rmqr.js';
import { UncorrectableError } from '../src/verify/reed-solomon.js';

/** Turn fixture row strings back into a module buffer. */
const fromRows = (rows: string[]) => {
  const height = rows.length;
  const width = rows[0].length;
  const modules = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) modules[y * width + x] = rows[y][x] === '#' ? 1 : 0;
  }
  return { modules, width, height };
};

const microFixtures: {
  cases: { text: string; version: MicroVersion; ecc: EccLevel; mask: number; rows: string[] }[];
} = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'micro-qr.json'), 'utf8'));

const rmqrFixtures: {
  cases: { text: string; version: RmqrVersion; ecc: RmqrLevel; rows: string[] }[];
} = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'rmqr.json'), 'utf8'));

describe('Micro QR decoding', () => {
  // The decisive test. Round-tripping our own encoder would only prove the two
  // halves agree with each other; these are symbols an independent
  // implementation produced, so reading them proves we read the real format.
  it('reads every symbol segno produced, multi-segment and Kanji included', () => {
    const failures: string[] = [];
    for (const fixture of microFixtures.cases) {
      const { modules, width } = fromRows(fixture.rows);
      try {
        const result = decodeMicroMatrix({ size: width, modules });
        if (
          result.text !== fixture.text ||
          result.version !== fixture.version ||
          result.ecc !== fixture.ecc ||
          result.mask !== fixture.mask
        ) {
          failures.push(`${JSON.stringify(fixture.text)} ${fixture.version}-${fixture.ecc}`);
        }
      } catch (error) {
        failures.push(
          `${JSON.stringify(fixture.text)} ${fixture.version}-${fixture.ecc}: ${(error as Error).message}`,
        );
      }
    }
    expect(failures).toEqual([]);
    expect(microFixtures.cases.length).toBeGreaterThan(600);
  });

  it('round trips our own encoder across every version and level', () => {
    for (const text of ['1', '12345', 'HELLO', 'hello', 'AC-42']) {
      for (const version of MICRO_VERSIONS) {
        for (const ecc of MICRO_LEVELS[version]) {
          let matrix: ReturnType<typeof encodeMicro>;
          try {
            matrix = encodeMicro(text, { version, ecc, boostEcc: false });
          } catch {
            continue; // does not fit at this version
          }
          const result = decodeMicroMatrix(matrix);
          expect(result.text, `${text} ${version}-${ecc}`).toBe(text);
          expect(result.version).toBe(version);
          expect(result.ecc).toBe(ecc);
        }
      }
    }
  });

  it('recovers the mode as well as the payload', () => {
    expect(decodeMicroMatrix(encodeMicro('12345')).mode).toBe('numeric');
    expect(decodeMicroMatrix(encodeMicro('HELLO')).mode).toBe('alphanumeric');
    expect(decodeMicroMatrix(encodeMicro('hello')).mode).toBe('byte');
  });

  it('repairs damage in versions that can correct', () => {
    const matrix = encodeMicro('HELLO', { version: 'M4', ecc: 'Q', boostEcc: false });
    const modules = Uint8Array.from(matrix.modules);
    // Flip a handful of data modules well inside the symbol.
    let flipped = 0;
    for (let i = 0; i < modules.length && flipped < 6; i++) {
      if (matrix.kinds[i] === 0 /* MODULE.DATA */) {
        modules[i] ^= 1;
        flipped++;
      }
    }
    const result = decodeMicroMatrix({ size: matrix.size, modules });
    expect(result.text).toBe('HELLO');
    expect(result.corrected).toBeGreaterThan(0);
  });

  it('refuses to repair M1, which carries detection only', () => {
    // The standard gives M1 check codewords with no correction capability, so
    // damage must be reported rather than guessed at.
    const matrix = encodeMicro('12345', { version: 'M1' });
    const modules = Uint8Array.from(matrix.modules);
    for (let i = 0; i < modules.length; i++) {
      if (matrix.kinds[i] === 0) {
        modules[i] ^= 1;
        break;
      }
    }
    expect(() => decodeMicroMatrix({ size: matrix.size, modules })).toThrow(UncorrectableError);
  });

  it('rejects a grid that is not a Micro QR size', () => {
    expect(() => decodeMicroMatrix({ size: 21, modules: new Uint8Array(21 * 21) })).toThrow(
      /not a Micro QR size/,
    );
  });
});

describe('rMQR decoding', () => {
  it('reads every symbol rmqrcode produced', () => {
    const failures: string[] = [];
    for (const fixture of rmqrFixtures.cases) {
      const { modules, width, height } = fromRows(fixture.rows);
      try {
        const result = decodeRmqrMatrix({ modules, width, height });
        if (
          result.text !== fixture.text ||
          result.version !== fixture.version ||
          result.ecc !== fixture.ecc
        ) {
          failures.push(`${JSON.stringify(fixture.text)} ${fixture.version}-${fixture.ecc}`);
        }
      } catch (error) {
        failures.push(
          `${JSON.stringify(fixture.text)} ${fixture.version}-${fixture.ecc}: ${(error as Error).message}`,
        );
      }
    }
    expect(failures).toEqual([]);
    expect(rmqrFixtures.cases.length).toBeGreaterThan(400);
  });

  it('round trips our own encoder across all 32 sizes and both levels', () => {
    let checked = 0;
    for (const text of ['A', '12345', 'HELLO WORLD 123']) {
      for (const version of RMQR_VERSIONS) {
        for (const ecc of ['M', 'H'] as const) {
          let matrix: ReturnType<typeof encodeRmqr>;
          try {
            matrix = encodeRmqr(text, { version, ecc });
          } catch {
            continue;
          }
          const result = decodeRmqrMatrix(matrix);
          expect(result.text, `${text} ${version}-${ecc}`).toBe(text);
          expect(result.version).toBe(version);
          expect(result.ecc).toBe(ecc);
          checked++;
        }
      }
    }
    // Every size should be exercised several times over.
    expect(checked).toBeGreaterThan(100);
  });

  it('reads mixed block sizes correctly, which is where the reference loses data', () => {
    // R13x99-M splits into blocks of 36 and 37 data codewords, and R17x139-H
    // into 12s and 13s. An interleaver that stops at the first exhausted block
    // drops the tail of the longer ones and the payload comes back truncated.
    for (const [version, ecc] of [
      ['R13x99', 'M'],
      ['R17x139', 'H'],
      ['R17x43', 'H'],
    ] as const) {
      const text = 'MIXED BLOCK SIZES 12345';
      const result = decodeRmqrMatrix(encodeRmqr(text, { version, ecc }));
      expect(result.text, `${version}-${ecc}`).toBe(text);
    }
  });

  it('reads R17x43-M, which the reference implementation cannot produce at all', () => {
    // Its table gives that version 21 error correction codewords, a degree with
    // no generator polynomial, so it raises rather than encoding. Ours uses 22.
    const result = decodeRmqrMatrix(encodeRmqr('SERIAL-4417', { version: 'R17x43', ecc: 'M' }));
    expect(result.text).toBe('SERIAL-4417');
    expect(result.version).toBe('R17x43');
  });

  it('repairs damage', () => {
    const matrix = encodeRmqr('REPAIR ME 123', { version: 'R13x99', ecc: 'H' });
    const modules = Uint8Array.from(matrix.modules);
    let flipped = 0;
    for (let i = 0; i < modules.length && flipped < 8; i++) {
      if (matrix.kinds[i] === 0) {
        modules[i] ^= 1;
        flipped++;
      }
    }
    const result = decodeRmqrMatrix({ modules, width: matrix.width, height: matrix.height });
    expect(result.text).toBe('REPAIR ME 123');
    expect(result.corrected).toBeGreaterThan(0);
  });

  it('rejects dimensions that are not an rMQR size', () => {
    expect(() => decodeRmqrMatrix({ modules: new Uint8Array(100), width: 10, height: 10 })).toThrow(
      /not an rMQR size/,
    );
  });
});

describe('decodeMatrix dispatches on variant', () => {
  it('reads a QR symbol', () => {
    expect(decodeMatrix(encode('https://example.com')).text).toBe('https://example.com');
  });

  it('reads a Micro QR symbol through the same entry point', () => {
    const result = decodeMatrix(encodeMicro('12345'));
    expect(result.text).toBe('12345');
    expect(result.segments[0].mode).toBe('numeric');
  });

  it('reads an rMQR symbol through the same entry point', () => {
    const result = decodeMatrix(encodeRmqr('HELLO'));
    expect(result.text).toBe('HELLO');
    expect(result.segments[0].mode).toBe('alphanumeric');
  });
});
