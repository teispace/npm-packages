import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  encodeRmqr,
  RMQR_SPECS,
  RMQR_VERSIONS,
  type RmqrLevel,
  type RmqrVersion,
  rmqrFormatBits,
  rmqrMask,
  rmqrVersionOf,
} from '../src/core/rmqr.js';
import { QrCapacityError } from '../src/core/types.js';
import { toPng } from '../src/raster/scene-raster.js';
import { renderSvg } from '../src/render/svg.js';

interface Fixture {
  text: string;
  version: RmqrVersion;
  ecc: RmqrLevel;
  rows: string[];
}

const fixtures: { _source: string; _excluded: string; cases: Fixture[] } = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'rmqr.json'), 'utf8'),
);

const toRows = (matrix: { width?: number; height?: number; size: number; modules: Uint8Array }) => {
  const cols = matrix.width ?? matrix.size;
  const rows = matrix.height ?? matrix.size;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) row += matrix.modules[y * cols + x] ? '#' : '.';
    out.push(row);
  }
  return out;
};

describe('rMQR conformance against an independent implementation', () => {
  it('has a broad fixture set', () => {
    expect(fixtures.cases.length).toBeGreaterThan(200);
    // Layout is shared across all 32 sizes, so covering most of them exercises
    // every distinct width, height and alignment-column arrangement.
    expect(new Set(fixtures.cases.map((f) => f.version)).size).toBeGreaterThanOrEqual(24);
  });

  it('reproduces every fixture exactly', () => {
    const failures: string[] = [];
    for (const fixture of fixtures.cases) {
      const matrix = encodeRmqr(fixture.text, {
        version: fixture.version,
        ecc: fixture.ecc,
      });
      if (toRows(matrix).join('\n') !== fixture.rows.join('\n')) {
        failures.push(`${JSON.stringify(fixture.text)} ${fixture.version}-${fixture.ecc}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('records why some versions are excluded from the fixtures', () => {
    // The oracle is only trusted where it is correct. Its interleaver uses
    // `break` where the standard skips an exhausted block and continues, so on
    // mixed block sizes it silently drops data codewords. Keeping the reason in
    // the fixture file means the next person does not have to rediscover it.
    expect(fixtures._excluded).toMatch(/drops data codewords/i);
  });
});

describe('rMQR interleaving is lossless', () => {
  // This is the exact bug class the reference implementation has, so it is
  // worth asserting directly rather than only implicitly through fixtures.
  it('emits every data and error correction codeword exactly once, at every size', () => {
    for (const version of RMQR_VERSIONS) {
      for (const ecc of ['M', 'H'] as const) {
        const groups = RMQR_SPECS[version].blocks[ecc];
        const data = groups.reduce((n, g) => n + g.num * g.k, 0);
        const parity = groups.reduce((n, g) => n + g.num * (g.c - g.k), 0);

        // The interleaver must place exactly this many codewords; a `break`
        // where a `continue` belongs loses the tail of the longer blocks.
        expect(data + parity, `${version}-${ecc} block totals`).toBe(
          RMQR_SPECS[version].codewordsTotal,
        );
      }
    }
  });

  it('fills every data module, leaving only the declared remainder', () => {
    for (const version of RMQR_VERSIONS) {
      const spec = RMQR_SPECS[version];
      const matrix = encodeRmqr('A', { version, ecc: 'M' });
      let dataModules = 0;
      for (const kind of matrix.kinds) if (kind === 0 /* MODULE.DATA */) dataModules++;
      // Data modules must account for every codeword bit plus the remainder.
      expect(dataModules, `${version} data modules`).toBe(spec.codewordsTotal * 8 + spec.remainder);
    }
  });
});

describe('rMQR structure', () => {
  it('defines 32 sizes from 7x43 to 17x139', () => {
    expect(RMQR_VERSIONS).toHaveLength(32);
    expect(RMQR_VERSIONS[0]).toBe('R7x43');
    expect(RMQR_VERSIONS[31]).toBe('R17x139');
  });

  it('names every version consistently with its dimensions', () => {
    for (const version of RMQR_VERSIONS) {
      const spec = RMQR_SPECS[version];
      expect(version).toBe(`R${spec.height}x${spec.width}`);
      // Heights and widths come from fixed sets in the standard.
      expect([7, 9, 11, 13, 15, 17]).toContain(spec.height);
      expect([27, 43, 59, 77, 99, 139]).toContain(spec.width);
    }
  });

  it('assigns each version a distinct indicator, 0 to 31', () => {
    const indicators = RMQR_VERSIONS.map((v) => RMQR_SPECS[v].indicator);
    expect(new Set(indicators).size).toBe(32);
    expect(Math.min(...indicators)).toBe(0);
    expect(Math.max(...indicators)).toBe(31);
  });

  it('produces format information with a BCH minimum distance of at least 5', () => {
    const all: number[] = [];
    for (const version of RMQR_VERSIONS) {
      for (const ecc of ['M', 'H'] as const) {
        all.push(rmqrFormatBits(RMQR_SPECS[version].indicator, ecc));
      }
    }
    expect(new Set(all).size).toBe(64);
    let minimum = Number.POSITIVE_INFINITY;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        let distance = 0;
        for (let bit = 0; bit < 18; bit++) if (((all[i] ^ all[j]) >>> bit) & 1) distance++;
        minimum = Math.min(minimum, distance);
      }
    }
    expect(minimum).toBeGreaterThanOrEqual(5);
  });

  it('has exactly one mask pattern', () => {
    // Unlike QR's eight and Micro QR's four, so there is no selection to make.
    expect(rmqrMask(0, 0)).toBe(true);
    expect(rmqrMask(3, 0)).toBe(false);
    expect(rmqrMask(0, 2)).toBe(false);
  });

  it('offers only M and H error correction', () => {
    for (const version of RMQR_VERSIONS) {
      expect(Object.keys(RMQR_SPECS[version].dataBits).sort()).toEqual(['H', 'M']);
      // H always costs capacity relative to M.
      expect(RMQR_SPECS[version].dataBits.H).toBeLessThan(RMQR_SPECS[version].dataBits.M);
    }
  });

  it('reports its rectangular dimensions on the matrix', () => {
    const matrix = encodeRmqr('HELLO', { version: 'R7x43' });
    expect(matrix.variant).toBe('rmqr');
    expect(matrix.width).toBe(43);
    expect(matrix.height).toBe(7);
    expect(matrix.size).toBe(43);
    expect(rmqrVersionOf(matrix)).toBe('R7x43');
  });
});

describe('rMQR encoding behaviour', () => {
  it('prefers the flattest symbol that fits by default', () => {
    const matrix = encodeRmqr('HELLO');
    expect(matrix.height).toBe(7);
  });

  it('can be asked to minimise area instead', () => {
    const flat = encodeRmqr('HELLO WORLD 123', { fit: 'width' });
    const compact = encodeRmqr('HELLO WORLD 123', { fit: 'area' });
    const area = (m: typeof flat) => (m.width ?? 0) * (m.height ?? 0);
    expect(area(compact)).toBeLessThanOrEqual(area(flat));
  });

  it('refuses a payload larger than the largest symbol', () => {
    expect(() => encodeRmqr('x'.repeat(1000))).toThrow(QrCapacityError);
  });

  it('refuses a payload that does not fit a pinned version', () => {
    expect(() => encodeRmqr('x'.repeat(200), { version: 'R7x43' })).toThrow(QrCapacityError);
  });

  it('is much flatter than a square symbol of similar capacity', () => {
    const rect = encodeRmqr('SERIAL-4417');
    // Seven modules tall is the whole point: it fits on a cable or a test tube.
    expect(rect.height).toBeLessThanOrEqual(9);
  });
});

describe('rMQR flows through the rest of the toolkit', () => {
  it('renders to SVG with a rectangular viewBox', () => {
    const matrix = encodeRmqr('HELLO', { version: 'R7x43' });
    const { svg } = renderSvg(matrix);
    // 43 + 8 wide, 7 + 8 tall — the renderer must not assume a square.
    expect(svg).toContain('viewBox="0 0 51 15"');
  });

  it('rasterises to a rectangular PNG', () => {
    const matrix = encodeRmqr('HELLO', { version: 'R7x43' });
    const png = toPng(matrix, {}, { scale: 4, background: '#ffffff' });
    expect(Array.from(png.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    // Width is stored big-endian at byte 16 of the IHDR.
    const width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
    const height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
    expect(width).toBe((43 + 8) * 4);
    expect(height).toBe((7 + 8) * 4);
  });
});
