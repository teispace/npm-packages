import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import {
  createZip,
  EXPORT_FORMATS,
  exportFilename,
  exportQr,
  getFormat,
  sanitizeFilename,
} from '../src/export/index.js';
import { parseCsv, planBatch, toCsv, uniqueFilenames } from '../src/export.js';
import { serializePayload } from '../src/payload/index.js';
import { scan } from '../src/verify/api.js';

const decoder = new TextDecoder();
const matrix = encode('https://example.com/export-check');

describe('exportQr', () => {
  it('produces every declared format', () => {
    for (const info of EXPORT_FORMATS) {
      const result = exportQr(matrix, { moduleShape: 'rounded' }, info.id, { sideMm: 40 });
      expect(result.bytes.length, info.id).toBeGreaterThan(0);
      expect(result.mime).toContain(info.mime);
      expect(result.extension).toBe(info.extension);
    }
  });

  it('rejects an unknown format by name', () => {
    // @ts-expect-error deliberately invalid
    expect(() => exportQr(matrix, {}, 'tiff')).toThrow(/Unknown export format/);
  });

  it('builds filenames from a sanitised stem', () => {
    expect(exportFilename('My Code / 2026', 'png')).toMatch(/\.png$/);
    expect(exportFilename('x', 'pdf')).toBe('x.pdf');
    expect(sanitizeFilename('a/b\\c')).not.toMatch(/[/\\]/);
  });

  it('exposes format metadata by id', () => {
    expect(getFormat('pdf')?.vector).toBe(true);
    expect(getFormat('png')?.vector).toBe(false);
    expect(getFormat('nope')).toBeUndefined();
  });
});

describe('PDF output', () => {
  const pdf = exportQr(matrix, { moduleShape: 'rounded' }, 'pdf', {
    sideMm: 40,
    title: 'teiqr check',
  }).bytes;
  const text = decoder.decode(pdf);

  it('has a valid header and trailer', () => {
    expect(text.startsWith('%PDF-1.')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('startxref');
  });

  it('writes a cross-reference table whose offsets actually point at objects', () => {
    // A wrong xref is the single most common way a hand-written PDF fails to
    // open, and it fails silently in some readers — so check every offset.
    const startxref = Number(/startxref\s+(\d+)/.exec(text)?.[1]);
    expect(Number.isFinite(startxref)).toBe(true);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const table = text.slice(startxref);
    const entries = [...table.matchAll(/^(\d{10}) (\d{5}) ([nf])\s*$/gm)];
    expect(entries.length).toBeGreaterThan(1);

    for (const [, offsetStr, , kind] of entries) {
      if (kind !== 'n') continue;
      const offset = Number(offsetStr);
      // Each in-use entry must land on an "N 0 obj" header.
      expect(text.slice(offset), `xref offset ${offset}`).toMatch(/^\d+ 0 obj/);
    }
  });

  it('sizes the page to the requested physical dimensions', () => {
    // 40 mm at 72 points per inch is 113.386 pt.
    const box = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
    expect(box).not.toBeNull();
    expect(Number(box?.[1])).toBeCloseTo((40 / 25.4) * 72, 1);
    expect(Number(box?.[2])).toBeCloseTo((40 / 25.4) * 72, 1);
  });

  it('records the title it was given', () => {
    expect(text).toContain('teiqr check');
  });

  it('scales with sideMm', () => {
    const big = decoder.decode(exportQr(matrix, {}, 'pdf', { sideMm: 80 }).bytes);
    const box = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)/.exec(big);
    expect(Number(box?.[1])).toBeCloseTo((80 / 25.4) * 72, 1);
  });
});

describe('EPS output', () => {
  const eps = decoder.decode(
    exportQr(matrix, { moduleShape: 'square' }, 'eps', { sideMm: 40, title: 'teiqr eps' }).bytes,
  );

  it('starts with the DSC magic and ends with EOF', () => {
    expect(eps.startsWith('%!PS-Adobe-3.0 EPSF-3.0')).toBe(true);
    expect(eps.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares a bounding box matching the requested size', () => {
    const box = /%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)/.exec(eps);
    expect(box).not.toBeNull();
    const expected = Math.ceil((40 / 25.4) * 72);
    expect(Number(box?.[3])).toBeCloseTo(expected, 0);
    expect(Number(box?.[4])).toBeCloseTo(expected, 0);
  });

  it('never lets a data line begin with a percent sign', () => {
    // A line starting with % inside the body would be read as a DSC comment
    // and silently truncate the drawing.
    const lines = eps.split('\n');
    const header = lines.findIndex((l) => l.startsWith('%%EndComments'));
    expect(header).toBeGreaterThan(0);
    for (const line of lines.slice(header + 1, -1)) {
      if (line.startsWith('%%') || line.startsWith('%!')) continue;
      expect(line.startsWith('%'), `body line began with %: ${line.slice(0, 40)}`).toBe(false);
    }
  });
});

describe('SVG and PNG through exportQr match the direct renderers', () => {
  it('PNG round trips through the scanner', () => {
    const { bytes } = exportQr(matrix, {}, 'png', { scale: 8, background: '#ffffff' });
    expect(scan(bytes).text).toBe('https://example.com/export-check');
  });

  it('SVG is well formed', () => {
    const svg = decoder.decode(exportQr(matrix, {}, 'svg').bytes);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});

describe('ZIP writer', () => {
  /** Parse the archive back with Node's inflater, independent of our DEFLATE. */
  const readZip = (zip: Uint8Array) => {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // Locate the end-of-central-directory record.
    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    expect(eocd).toBeGreaterThanOrEqual(0);
    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);

    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < count; i++) {
      expect(view.getUint32(offset, true)).toBe(0x02014b50);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));

      const localNameLength = view.getUint16(localOffset + 26, true);
      const extraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + extraLength;
      const payload = zip.subarray(dataStart, dataStart + compressedSize);

      files[name] = method === 8 ? new Uint8Array(inflateRawSync(payload)) : payload;
      offset +=
        46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
    return files;
  };

  it('produces an archive Node can extract, byte for byte', () => {
    const png = exportQr(matrix, {}, 'png', { scale: 6 }).bytes;
    const svg = exportQr(matrix, {}, 'svg').bytes;
    const zip = createZip([
      { name: 'codes/a.png', data: png, store: true },
      { name: 'codes/b.svg', data: svg },
      { name: 'notes.txt', data: 'hello, world' },
    ]);

    const files = readZip(zip);
    expect(Object.keys(files).sort()).toEqual(['codes/a.png', 'codes/b.svg', 'notes.txt']);
    expect(Array.from(files['codes/a.png'])).toEqual(Array.from(png));
    expect(Array.from(files['codes/b.svg'])).toEqual(Array.from(svg));
    expect(decoder.decode(files['notes.txt'])).toBe('hello, world');
  });

  it('extracted PNG entries still scan', () => {
    const png = exportQr(matrix, {}, 'png', { scale: 8, background: '#ffffff' }).bytes;
    const files = readZip(createZip([{ name: 'q.png', data: png }]));
    expect(scan(files['q.png']).text).toBe('https://example.com/export-check');
  });

  it('is byte-identical across builds, so output is diffable', () => {
    const entries = [{ name: 'a.txt', data: 'same' }];
    expect(Array.from(createZip(entries))).toEqual(Array.from(createZip(entries)));
  });

  it('handles an empty archive', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22); // end-of-central-directory record only
  });

  it('refuses more entries than the format can index', () => {
    const many = Array.from({ length: 65_536 }, (_, i) => ({ name: `${i}.txt`, data: 'x' }));
    expect(() => createZip(many)).toThrow(RangeError);
  });
});

describe('CSV-driven batch', () => {
  it('plans one row per record and names the files', () => {
    const csv = toCsv(
      ['name', 'ssid', 'password'],
      [
        ['cafe', 'Pokhara Cafe', 'himalaya2026'],
        ['office', 'Teispace HQ', 'letmein'],
      ],
    );
    const plan = planBatch('wifi', parseCsv(csv));

    expect(plan.typeId).toBe('wifi');
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].filename).toContain('cafe');
    expect(plan.rows[0].missing).toEqual([]);
    // Every planned row must serialise to something encodable.
    for (const row of plan.rows) {
      const text = serializePayload('wifi', row.values);
      expect(text).toContain('WIFI:');
      expect(() => encode(text)).not.toThrow();
    }
  });

  it('reports rows that are missing required fields rather than dropping them', () => {
    const plan = planBatch('wifi', parseCsv(toCsv(['name', 'password'], [['x', 'nope']])));
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].missing).toContain('ssid');
  });

  it('does not silently substitute sample data for absent columns', () => {
    // The dangerous case: a CSV with no `ssid` column must not quietly emit a
    // batch of codes pointing at the payload type's sample network.
    const plan = planBatch('wifi', parseCsv(toCsv(['name', 'password'], [['x', 'nope']])));
    expect(plan.rows[0].values.ssid).toBeUndefined();
  });

  it('fills from the sample only when explicitly asked', () => {
    const plan = planBatch('wifi', parseCsv(toCsv(['name', 'password'], [['x', 'nope']])), {
      fillFromSample: true,
    });
    expect(plan.rows[0].values.ssid).toBeDefined();
    expect(plan.rows[0].missing).toEqual([]);
  });

  it('deduplicates colliding filenames', () => {
    expect(uniqueFilenames(['a', 'a', 'b', 'a'])).toEqual(['a', 'a-2', 'b', 'a-3']);
  });

  it('round trips a CSV through toCsv and parseCsv, quoting included', () => {
    const headers = ['h1', 'h2'];
    const rows = [
      ['plain', 'has,comma'],
      ['has"quote', 'has\nnewline'],
    ];
    const parsed = parseCsv(toCsv(headers, rows));
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toEqual(rows);
  });
});
