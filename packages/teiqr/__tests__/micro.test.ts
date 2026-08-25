import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  encodeMicro,
  MICRO_LEVELS,
  MICRO_VERSIONS,
  type MicroVersion,
  microDataBits,
  microFormatBits,
  microModel,
  microSize,
  microVersionOf,
} from '../src/core/micro.js';
import {
  ALPHANUMERIC_CHARSET,
  makeAlphanumericSegment,
  makeByteSegment,
  makeKanjiSegment,
  makeNumericSegment,
  planBitsWith,
  planSegmentsWith,
  segmentBits,
} from '../src/core/segment.js';
import { QrCapacityError, type QrSegment } from '../src/core/types.js';
import { decodeMicroMatrix } from '../src/verify/decode-micro.js';
import '../src/kanji.js';
import { toPng } from '../src/raster/scene-raster.js';
import { renderSvg } from '../src/render/svg.js';

type FixtureMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';

interface Fixture {
  /** The segmentation the reference was given, so both encoders write the same runs. */
  segments: [string, FixtureMode][];
  text: string;
  version: MicroVersion;
  ecc: 'L' | 'M' | 'Q';
  mask: number;
  rows: string[];
}

const fixtures: { _source: string; _segments: string; cases: Fixture[] } = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'micro-qr.json'), 'utf8'),
);

const encoder = new TextEncoder();

/** Build the exact segments the fixture pins, rather than letting the optimiser choose. */
const pinned = (fixture: Fixture): QrSegment[] =>
  fixture.segments.map(([text, mode]) => {
    if (mode === 'numeric') return makeNumericSegment(text);
    if (mode === 'alphanumeric') return makeAlphanumericSegment(text);
    if (mode === 'kanji') return makeKanjiSegment(text);
    return makeByteSegment(encoder.encode(text));
  });

/** Render a matrix as the same row strings the fixtures use. */
const toRows = (matrix: { size: number; modules: Uint8Array }): string[] => {
  const rows: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let row = '';
    for (let x = 0; x < matrix.size; x++) {
      row += matrix.modules[y * matrix.size + x] ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
};

describe('Micro QR conformance against an independent implementation', () => {
  // These fixtures are segno's output. Comparing module-for-module against a
  // second ISO-conformant implementation is the only practical way to be
  // confident here: a single wrong value in a capacity or count-width table
  // produces a symbol that round-trips through our own decoder perfectly and
  // is rejected by every real scanner. That exact failure happened twice while
  // this module was written — once from reusing QR's column-direction
  // expression, whose arithmetic only works for QR's 4v+17 sizes, and once
  // from padding M1 and M3 with 0xEC/0x11 where the standard requires zeros.
  it('has a substantial fixture set', () => {
    expect(fixtures.cases.length).toBeGreaterThan(600);
  });

  it('covers multi-segment and Kanji payloads, not only single-mode ones', () => {
    const shapes = new Set(fixtures.cases.map((f) => f.segments.map(([, m]) => m).join('+')));
    expect([...shapes].filter((s) => s.includes('+')).length).toBeGreaterThan(4);
    expect([...shapes].some((s) => s.includes('kanji'))).toBe(true);
  });

  it('reproduces every fixture exactly', () => {
    const failures: string[] = [];
    for (const fixture of fixtures.cases) {
      const matrix = encodeMicro(pinned(fixture), {
        version: fixture.version,
        ecc: fixture.ecc,
        mask: fixture.mask,
        // The fixtures were generated with boosting disabled, so the level in
        // each one is exactly the level requested.
        boostEcc: false,
      });
      const rows = toRows(matrix);
      if (rows.join('\n') !== fixture.rows.join('\n')) {
        const shape = fixture.segments.map(([t, m]) => `${m}[${t}]`).join('+');
        failures.push(`${shape} ${fixture.version}-${fixture.ecc} mask=${fixture.mask}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('covers every version and level combination the standard permits', () => {
    const seen = new Set(fixtures.cases.map((f) => `${f.version}-${f.ecc}`));
    expect([...seen].sort()).toEqual([
      'M1-L',
      'M2-L',
      'M2-M',
      'M3-L',
      'M3-M',
      'M4-L',
      'M4-M',
      'M4-Q',
    ]);
  });
});

describe('Micro QR structure', () => {
  it('sizes M1 to M4 as 11, 13, 15 and 17 modules', () => {
    expect(MICRO_VERSIONS.map(microSize)).toEqual([11, 13, 15, 17]);
  });

  it('computes format information matching the standard, all 32 values distinct', () => {
    const all: number[] = [];
    for (let symbol = 0; symbol < 8; symbol++) {
      for (let mask = 0; mask < 4; mask++) all.push(microFormatBits(symbol, mask));
    }
    expect(all).toHaveLength(32);
    expect(new Set(all).size).toBe(32);
    // The all-zero symbol/mask pair is the XOR mask itself.
    expect(microFormatBits(0, 0)).toBe(0x4445);
  });

  it('restricts levels per version as the standard does', () => {
    expect(MICRO_LEVELS.M1).toEqual(['L']);
    expect(MICRO_LEVELS.M2).toEqual(['L', 'M']);
    expect(MICRO_LEVELS.M3).toEqual(['L', 'M']);
    expect(MICRO_LEVELS.M4).toEqual(['L', 'M', 'Q']);
    // There is no level H in Micro QR at any version.
    for (const version of MICRO_VERSIONS) {
      expect(MICRO_LEVELS[version]).not.toContain('H');
    }
  });

  it('rejects a level a version does not offer', () => {
    expect(() => microDataBits('M1', 'M')).toThrow(/does not support level/);
    expect(() => microDataBits('M2', 'Q')).toThrow(/does not support level/);
    expect(() => microDataBits('M3', 'H')).toThrow(/does not support level/);
  });

  it('reports capacities that rise with version', () => {
    expect(microDataBits('M1', 'L')).toBe(20);
    expect(microDataBits('M2', 'L')).toBe(40);
    expect(microDataBits('M3', 'L')).toBe(84);
    expect(microDataBits('M4', 'L')).toBe(128);
    // A stronger level always costs capacity at the same version.
    expect(microDataBits('M4', 'Q')).toBeLessThan(microDataBits('M4', 'M'));
    expect(microDataBits('M4', 'M')).toBeLessThan(microDataBits('M4', 'L'));
  });

  it('places exactly one finder pattern', () => {
    const matrix = encodeMicro('12345');
    let finder = 0;
    for (const kind of matrix.kinds) if (kind === 1 /* MODULE.FINDER */) finder++;
    // A 7x7 finder is 49 modules; a full QR symbol would have three of them.
    expect(finder).toBe(49);
  });

  it('marks itself as the micro variant, leaving QR matrices untouched', () => {
    const micro = encodeMicro('12345');
    expect(micro.variant).toBe('micro');
    expect(microVersionOf(micro)).toBe('M1');
  });
});

describe('Micro QR encoding behaviour', () => {
  it('picks the smallest version that fits', () => {
    expect(microVersionOf(encodeMicro('12345'))).toBe('M1');
    expect(microVersionOf(encodeMicro('1234567890'))).toBe('M2');
  });

  it('uses M2 or larger for alphanumeric, which M1 cannot encode', () => {
    const version = microVersionOf(encodeMicro('HELLO'));
    expect(MICRO_VERSIONS.indexOf(version)).toBeGreaterThanOrEqual(1);
  });

  it('uses M3 or larger for byte data, which M1 and M2 cannot encode', () => {
    const version = microVersionOf(encodeMicro('hello'));
    expect(MICRO_VERSIONS.indexOf(version)).toBeGreaterThanOrEqual(2);
  });

  it('refuses a payload larger than M4 can hold', () => {
    // Micro QR tops out at 35 digits; this is a normal outcome, not a defect.
    expect(() => encodeMicro('1'.repeat(40))).toThrow(QrCapacityError);
    expect(() => encodeMicro('x'.repeat(60))).toThrow(QrCapacityError);
  });

  it('rejects a mask outside 0-3, since Micro QR has only four', () => {
    expect(() => encodeMicro('12345', { mask: 4 })).toThrow(RangeError);
    expect(() => encodeMicro('12345', { mask: -1 })).toThrow(RangeError);
  });

  it('honours a pinned mask', () => {
    for (let mask = 0; mask < 4; mask++) {
      expect(encodeMicro('12345', { mask }).mask).toBe(mask);
    }
  });

  it('is markedly smaller than the equivalent full QR symbol', () => {
    const micro = encodeMicro('12345');
    // M1 is 11 modules where a version-1 QR symbol is 21 — under a third the area.
    expect(micro.size).toBe(11);
    expect(micro.size ** 2 / 21 ** 2).toBeLessThan(0.3);
  });
});

describe('Micro QR mode selection', () => {
  // The conformance fixtures pin their segmentation so both encoders write the
  // same runs; these cover the choice itself, which the fixtures deliberately
  // do not exercise.

  /** Bits a payload needs if the whole string is forced into one mode. */
  const singleModeBits = (text: string, version: MicroVersion): number => {
    const model = microModel(version);
    const candidates: QrSegment[][] = [];
    if (/^[0-9]*$/.test(text)) candidates.push([makeNumericSegment(text)]);
    if ([...text].every((c) => ALPHANUMERIC_CHARSET.includes(c))) {
      candidates.push([makeAlphanumericSegment(text)]);
    }
    candidates.push([makeByteSegment(encoder.encode(text))]);
    return Math.min(...candidates.map((segments) => segmentBits(segments, model)));
  };

  it('never chooses a segmentation larger than encoding the whole string in one mode', () => {
    const payloads = ['abc123XYZ', 'HELLO123', '12AB', 'x42', 'AC-42', 'Hi 42!', '1234567'];
    for (const text of payloads) {
      for (const version of ['M3', 'M4'] as const) {
        const model = microModel(version);
        const plan = planSegmentsWith(text, model);
        expect(planBitsWith(plan, model), `${text} at ${version}`).toBeLessThanOrEqual(
          singleModeBits(text, version),
        );
      }
    }
  });

  it('splits mixed content rather than falling back to byte mode for all of it', () => {
    // 'abc' is lowercase so it must be bytes, but '123XYZ' is alphanumeric.
    // One byte segment costs 72 payload bits against 24 + 33 for the split.
    const model = microModel('M4');
    const plan = planSegmentsWith('abc123XYZ', model);
    expect(plan.segments.map((seg) => seg.mode)).toEqual(['byte', 'alphanumeric']);
    expect(planBitsWith(plan, model)).toBeLessThan(singleModeBits('abc123XYZ', 'M4'));
  });

  it('offers only the modes each version has, without special-casing them', () => {
    // M1 is numeric-only and M2 has no byte mode, which is why lowercase text
    // has to grow to M3 and alphanumeric text to M2.
    expect(microModel('M1').countBits('alphanumeric')).toBeNull();
    expect(microModel('M2').countBits('byte')).toBeNull();
    expect(microModel('M2').countBits('kanji')).toBeNull();
    expect(microModel('M3').countBits('kanji')).toBe(3);
  });

  it('round trips a multi-segment payload, reporting each run', () => {
    const result = decodeMicroMatrix(encodeMicro('abc123XYZ', { version: 'M4' }));
    expect(result.text).toBe('abc123XYZ');
    expect(result.segments.map((seg) => seg.mode)).toEqual(['byte', 'alphanumeric']);
    expect(result.segments.map((seg) => seg.text)).toEqual(['abc', '123XYZ']);
  });

  it('round trips a stream that ends exactly on a codeword boundary', () => {
    // These are the cases the segno fixtures skip, because segno appends a
    // spurious zero byte when the terminator lands on a boundary. Covering
    // them by round trip is what keeps that path from going untested.
    for (const [text, version] of [
      ['HELLO123', 'M4'],
      ['12AB', 'M2'],
    ] as const) {
      const matrix = encodeMicro(text, { version, boostEcc: false });
      expect(decodeMicroMatrix(matrix).text, `${text} at ${version}`).toBe(text);
    }
  });
});

describe('Micro QR Kanji mode', () => {
  it('selects Kanji where it is available and cheaper than bytes', () => {
    const matrix = encodeMicro('漢字', { kanji: true });
    const result = decodeMicroMatrix(matrix);
    expect(result.segments.map((seg) => seg.mode)).toEqual(['kanji']);
    expect(result.text).toBe('漢字');
  });

  it('fits text in a smaller symbol than byte mode would', () => {
    // 13 bits a character against 24 for the same character as UTF-8 bytes.
    // Five characters is 65 bits against 120, which is M3 rather than M4.
    const text = 'こんにちは';
    const withKanji = encodeMicro(text, { kanji: true, boostEcc: false });
    const withoutKanji = encodeMicro(text, { kanji: false, boostEcc: false });
    expect(microVersionOf(withKanji)).toBe('M3');
    expect(microVersionOf(withoutKanji)).toBe('M4');
    expect(decodeMicroMatrix(withKanji).text).toBe(text);
    expect(decodeMicroMatrix(withoutKanji).text).toBe(text);
  });

  it('still refuses text no Micro QR version can hold', () => {
    // Ten characters is 130 bits in Kanji mode, plus a 3-bit mode indicator
    // and a 4-bit count, against M4-L's 128. Kanji buys room, not unlimited
    // room, and running out is a normal outcome for a symbology this small.
    const text = 'こんにちは世界です。';
    expect([...text]).toHaveLength(10);
    expect(() => encodeMicro(text, { kanji: true })).toThrow(QrCapacityError);
  });

  it('mixes Kanji with other modes in one symbol', () => {
    const result = decodeMicroMatrix(encodeMicro('漢字123', { kanji: true, version: 'M4' }));
    expect(result.text).toBe('漢字123');
    expect(result.segments.map((seg) => seg.mode)).toEqual(['kanji', 'numeric']);
  });

  it('ignores Kanji at versions that cannot carry it', () => {
    // M1 and M2 have no Kanji mode, so the encoder must grow rather than emit
    // a segment the symbol cannot describe.
    expect(
      MICRO_VERSIONS.indexOf(microVersionOf(encodeMicro('漢', { kanji: true }))),
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('Micro QR binary payloads', () => {
  it('encodes raw bytes, not only text', () => {
    const bytes = Uint8Array.from([0x00, 0xff, 0x7f, 0x80, 0x01]);
    const result = decodeMicroMatrix(encodeMicro(bytes, { version: 'M4' }));
    expect(Array.from(result.bytes)).toEqual(Array.from(bytes));
    expect(result.mode).toBe('byte');
  });

  it('refuses binary at versions with no byte mode', () => {
    expect(() => encodeMicro(Uint8Array.from([1, 2]), { version: 'M2' })).toThrow(QrCapacityError);
  });
});

describe('Micro QR flows through the rest of the toolkit', () => {
  it('renders to SVG like any other matrix', () => {
    const svg = renderSvg(encodeMicro('12345'), { moduleShape: 'rounded' }).svg;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 19 19"'); // 11 modules plus two quiet zones
  });

  it('rasterises to PNG', () => {
    const png = toPng(encodeMicro('12345'), {}, { scale: 8, background: '#ffffff' });
    expect(Array.from(png.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
