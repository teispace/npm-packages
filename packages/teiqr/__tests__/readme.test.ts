import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ECI, encode, encodeStructured } from '../src/core.js';
import { createZip, exportQr, parseCsv, planBatch, toCsv, uniqueFilenames } from '../src/export.js';
import { clone, qr } from '../src/index.js';
import {
  getPayloadType,
  PAYLOAD_TYPES,
  parsePayload,
  registerPayloadParser,
  registerPayloadType,
  serializePayload,
  val,
} from '../src/payload.js';
import { rasterize, toPng } from '../src/raster.js';
import { SAFETY_EVIDENCE } from '../src/render/safety.js';
import { renderSvg } from '../src/render.js';
import { BUILTIN_RULES, registerValidationRule, validate } from '../src/validate.js';
import { joinStructured, scan, scanAll, tryScan } from '../src/verify.js';
import '../src/kanji.js';

const README = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8');

/**
 * The README makes specific, checkable claims. A doc that drifts from the code
 * is worse than no doc, so the claims are asserted here rather than trusted.
 */
describe('README examples actually run', () => {
  it('quick start', () => {
    expect(qr('https://example.com').svg()).toContain('<svg');
    expect(qr('https://example.com').png({ scale: 12 })).toBeInstanceOf(Uint8Array);
    const bytes = qr('https://example.com').png({ scale: 10, background: '#ffffff' });
    expect(scan(bytes).text).toBe('https://example.com');
  });

  it('every QrCode method shown in the API table', () => {
    const code = qr('https://example.com', { ecc: 'Q', moduleShape: 'rounded' });
    expect(typeof code.svg()).toBe('string');
    expect(code.png({ scale: 12 })).toBeInstanceOf(Uint8Array);
    expect(code.dataUrl()).toMatch(/^data:image\/png;base64,/);
    expect(code.pixels({ scale: 8 }).width).toBeGreaterThan(0);
    expect(typeof code.terminal()).toBe('string');
    expect(code.validate().score).toBeGreaterThanOrEqual(0);
    expect(code.verify().text).toBe('https://example.com');
    expect(code.scene().items.length).toBeGreaterThan(0);
    expect(code.matrix.version).toBeGreaterThan(0);
  });

  it('boostEcc raises the level for free, exactly as documented', () => {
    expect(encode('A', { ecc: 'M' }).ecc).toBe('H');
    expect(encode('A', { ecc: 'M', boostEcc: false }).ecc).toBe('M');
  });

  it('the full styling example is accepted', () => {
    const svg = qr('https://example.com', {
      moduleShape: 'rounded',
      eyeFrame: 'rounded',
      eyeBall: 'rounded',
      body: {
        kind: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#0b1020' },
          { offset: 1, color: '#123a6b' },
        ],
      },
      eyeFrameFill: { kind: 'solid', color: '#000000' },
      background: { kind: 'solid', color: '#ffffff' },
      quietZone: 4,
      cornerRadius: 0,
      moduleSize: 8,
      gap: 0,
      frame: {
        style: 'label-bottom',
        text: 'SCAN ME',
        textColor: '#ffffff',
        background: '#000000',
        border: 1,
        cornerRadius: 2,
        fontFamily: 'Helvetica, Arial, sans-serif',
      },
    }).svg();
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('SCAN ME');
  });

  it('every input shape the scanning section lists', () => {
    const text = 'https://example.com';
    const png = qr(text).png({ scale: 8, background: '#ffffff' });
    expect(scan(Buffer.from(png)).text).toBe(text);
    expect(scan(`data:image/png;base64,${Buffer.from(png).toString('base64')}`).text).toBe(text);
    expect(scan(encode(text)).text).toBe(text);
    expect(tryScan(png)?.text).toBe(text);
    expect(scanAll(png)).toHaveLength(1);
  });

  it('the documented ScanResult fields all exist', () => {
    const result = scan(qr('field check', { ecc: 'Q' }).png({ scale: 8, background: '#fff' }));
    for (const key of [
      'text',
      'bytes',
      'version',
      'ecc',
      'mask',
      'segments',
      'corrected',
      'moduleSize',
      'origin',
    ]) {
      expect(result, `ScanResult.${key}`).toHaveProperty(key);
    }
    expect(result.corrected).toBe(0);
  });

  it('the clone example, including edited fields', () => {
    const original = 'WIFI:T:WPA;S:Pokhara Cafe;P:himalaya2026;;';
    const bytes = qr(original).png({ scale: 8, background: '#ffffff' });

    const cloned = clone(bytes, { moduleShape: 'rounded' });
    expect(cloned.payload.type).toBe('wifi');
    expect(cloned.payload.values.ssid).toBe('Pokhara Cafe');
    expect(cloned.payload.values.password).toBe('himalaya2026');
    expect(cloned.payload.confidence).toBe('exact');

    const updated = clone(
      bytes,
      { moduleShape: 'dot' },
      {
        ...cloned.payload.values,
        password: 'a-new-password',
      },
    );
    expect(updated.verify().text).toBe('WIFI:T:WPA;S:Pokhara Cafe;P:a-new-password;;');
  });

  it('the parsePayload example returns exactly the documented shape', () => {
    const parsed = parsePayload(String.raw`WIFI:T:WPA;S:My\;Cafe;P:hunter2;;`);
    expect(parsed.type).toBe('wifi');
    expect(parsed.label).toBe(getPayloadType('wifi')?.label);
    expect(parsed.confidence).toBe('exact');
    expect(parsed.values).toEqual({ encryption: 'WPA', ssid: 'My;Cafe', password: 'hunter2' });
  });

  it('the validation coverage fields are all present', () => {
    const report = validate(encode('https://example.com', { ecc: 'H', boostEcc: false }), {
      logo: {
        href: 'data:image/png;base64,',
        sizeRatio: 0.2,
        padding: 1,
        shape: 'square',
        excavate: true,
        background: null,
      },
    });
    for (const key of [
      'coveredModules',
      'coveredFraction',
      'damagedCodewords',
      'worstBlockDamaged',
      'worstBlockCapacity',
      'utilisation',
      'recoverable',
      'breaksFinder',
    ]) {
      expect(report.coverage, `coverage.${key}`).toHaveProperty(key);
    }
    for (const key of ['span', 'minSideMm', 'minModuleMm', 'recommendedSideMm', 'recommendedPx']) {
      expect(report.print, `print.${key}`).toHaveProperty(key);
    }
  });

  it('the extensibility examples', () => {
    registerValidationRule({
      id: 'readme-min-ecc',
      description: 'Printed codes must be level Q or better.',
      check: ({ matrix }) =>
        matrix.ecc === 'L' || matrix.ecc === 'M'
          ? {
              level: 'error',
              code: 'ecc-too-low',
              title: 'Raise error correction',
              detail: 'Company policy requires level Q or H for printed codes.',
            }
          : null,
    });
    expect(
      validate(encode('x', { ecc: 'L', boostEcc: false }), {}).issues.some(
        (i) => i.code === 'ecc-too-low',
      ),
    ).toBe(true);
    expect(validate(encode('x'), {}, { disableRules: ['inverted'] })).toBeDefined();
    expect(validate(encode('x'), {}, { rules: [...BUILTIN_RULES] })).toBeDefined();
    expect(validate(encode('x'), {}, { penalties: { warning: 5 } })).toBeDefined();

    registerPayloadType({
      id: 'readme-asset',
      label: 'Asset tag',
      group: 'plain',
      blurb: 'Opens the internal asset register.',
      fields: [{ name: 'id', label: 'Asset ID', type: 'text', required: true }],
      serialize: (v) => `ASSET:${val(v, 'id')}`,
      sample: { id: 'A-1024' },
    });
    registerPayloadParser({
      type: 'readme-asset',
      parse: (text) => (text.startsWith('ASSET:') ? { id: text.slice(6) } : null),
    });
    expect(serializePayload('readme-asset', { id: 'A-7' })).toBe('ASSET:A-7');
    expect(parsePayload('ASSET:A-7').values.id).toBe('A-7');
  });

  it('the Kanji, ECI and binary examples', () => {
    expect(qr('こんにちは世界', { kanji: true }).svg()).toContain('<svg');
    expect(qr('café', { eci: ECI.UTF8 }).verify().eci).toBe(ECI.UTF8);
    const binary = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const png = qr(binary, { ecc: 'H' }).png({ scale: 8, background: '#ffffff' });
    expect(Array.from(scan(png).bytes)).toEqual(Array.from(binary));
  });

  it('the Structured Append example', () => {
    const longText = 'abcdefghij0123456789'.repeat(400);
    const { symbols, count } = encodeStructured(longText, { ecc: 'M' });
    expect(count).toBeGreaterThan(1);
    const scanned = symbols.map((s) => scan(s));
    expect(joinStructured(scanned).text).toBe(longText);
  });

  it('the terminal example, and that invert flips the output', () => {
    const plain = qr('https://example.com').terminal({
      style: 'half',
      quietZone: 4,
      invert: false,
    });
    expect(plain).toContain('█');
    expect(qr('x').terminal({ invert: true })).not.toBe(qr('x').terminal({ invert: false }));
  });

  it('the raster caveats are reported, not hidden', () => {
    const { omitted } = rasterize(
      encode('labelled'),
      {
        frame: {
          style: 'label-bottom',
          text: 'SCAN ME',
          textColor: '#fff',
          background: '#000',
          border: 1,
          cornerRadius: 2,
          fontFamily: 'sans-serif',
        },
      },
      { scale: 8 },
    );
    expect(omitted.some((o) => o.includes('label'))).toBe(true);
  });

  it('the PDF/EPS export example', () => {
    const { bytes, mime, extension, omitted } = exportQr(
      encode('menu'),
      { moduleShape: 'rounded' },
      'pdf',
      { sideMm: 40, title: 'Table 12' },
    );
    expect(bytes.length).toBeGreaterThan(0);
    expect(mime).toBe('application/pdf');
    expect(extension).toBe('pdf');
    expect(omitted).toEqual([]);
    // 40mm is the actual page size, as the README claims.
    const box = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)/.exec(new TextDecoder().decode(bytes));
    expect(Number(box?.[1])).toBeCloseTo((40 / 25.4) * 72, 1);
  });

  it('the ZIP + CSV batch example', () => {
    const csvText = toCsv(['name', 'ssid', 'password'], [['cafe', 'Pokhara Cafe', 'pw1']]);
    const plan = planBatch('wifi', parseCsv(csvText));
    const names = uniqueFilenames(plan.rows.map((r) => r.filename));
    const zip = createZip(
      plan.rows.map((row, i) => ({
        name: `${names[i]}.png`,
        data: exportQr(qr(serializePayload('wifi', row.values)).matrix, {}, 'png', { scale: 10 })
          .bytes,
        store: true,
      })),
    );
    expect(zip.length).toBeGreaterThan(22);
    expect(new TextDecoder().decode(zip)).toContain('cafe.png');
  });

  it('planBatch does not invent data, as the README promises', () => {
    const plan = planBatch('wifi', parseCsv(toCsv(['name', 'password'], [['x', 'pw']])));
    expect(plan.rows[0].values.ssid).toBeUndefined();
    expect(plan.rows[0].missing).toContain('ssid');
    const filled = planBatch('wifi', parseCsv(toCsv(['name', 'password'], [['x', 'pw']])), {
      fillFromSample: true,
    });
    expect(filled.rows[0].values.ssid).toBeDefined();
  });

  it('renderSvg returns the documented fields', () => {
    const { svg, widthPx, heightPx } = renderSvg(encode('x'), { moduleShape: 'rounded' });
    expect(svg).toContain('<svg');
    expect(widthPx).toBeGreaterThan(0);
    expect(heightPx).toBeGreaterThan(0);
  });

  it('toPng accepts every documented option', () => {
    const bytes = toPng(
      encode('opts'),
      {},
      {
        scale: 12,
        background: '#ffffff',
        level: 6,
        dpi: 300,
      },
    );
    expect(scan(bytes).text).toBe('opts');
    expect(toPng(encode('w'), {}, { width: 512, background: '#fff' })).toBeInstanceOf(Uint8Array);
  });
});

describe('README numbers match reality', () => {
  it('quotes the safety pass rates the code actually records', () => {
    // Each "NN/72" in the shapes table must match SAFETY_EVIDENCE.
    for (const [key, [passed, total]] of Object.entries(SAFETY_EVIDENCE)) {
      const name = key.split(':')[1];
      const cell = new RegExp(`\`${name.replace(/[-]/g, '\\-')}\`[^|]*\\|\\s*${passed}/${total}`);
      expect(README, `${key} → ${passed}/${total}`).toMatch(cell);
    }
  });

  it('quotes the real payload type count', () => {
    // The README says "26 built-in types".
    const claimed = Number(/(\d+) built-in types/.exec(README)?.[1]);
    // Custom types registered by other tests would inflate a live count, so
    // compare against the built-ins only.
    const builtins = PAYLOAD_TYPES.filter((t) => !t.id.startsWith('readme-') && t.id !== 'asset');
    expect(claimed).toBe(builtins.length);
  });

  it('quotes the real Kanji table size', () => {
    const claimed = Number(/table is ([\d,]+) code points/.exec(README)?.[1].replace(/,/g, ''));
    expect(claimed).toBe(6953);
  });

  it('quotes the real N4 conformance figure', () => {
    // 477,360 = sum over versions 1..40 of (size^2 + 1) pairs, which is what
    // the conformance test actually brute-forces.
    let total = 0;
    for (let v = 1; v <= 40; v++) total += (v * 4 + 17) ** 2 + 1;
    expect(README).toContain(total.toLocaleString('en-US'));
  });

  it('does not name other packages', () => {
    // The README is about this package. Comparisons and competitor references
    // were removed deliberately, and this keeps them from creeping back.
    //
    // The npm-name check is case-sensitive on purpose: `qrcode` is a package,
    // `QrCode` is our own component, and a case-insensitive match would flag
    // every code sample on the page.
    const lowercasePackages = /\b(qrcode|qr-code-styling|qrious|qr-image|uqr|segno|rmqrcode)\b/g;
    const namedProjects = /\b(jsQR|paulmillr|ZXing)\b/gi;
    const hits = [
      ...[...README.matchAll(lowercasePackages)].map((m) => m[0]),
      ...[...README.matchAll(namedProjects)].map((m) => m[0]),
    ];
    expect(hits, `README names: ${[...new Set(hits)].join(', ')}`).toEqual([]);
  });

  it('documents every entry point the package actually exports', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    for (const path of Object.keys(pkg.exports)) {
      if (path === './package.json') continue;
      const name = path === '.' ? 'teiqr' : `teiqr/${path.slice(2)}`;
      expect(README, `README should document ${name}`).toContain(name);
    }
  });

  it('does not promise entry points that do not exist', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    const declared = new Set(
      Object.keys(pkg.exports).map((p) => (p === '.' ? 'teiqr' : `teiqr/${p.slice(2)}`)),
    );
    for (const match of README.matchAll(/`(teiqr\/[a-z-]+)`/g)) {
      expect(declared, `README mentions ${match[1]} but package.json does not export it`).toContain(
        match[1],
      );
    }
  });

  it('states zero runtime dependencies, and has zero', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies ?? {})).toHaveLength(0);
    expect(README).toMatch(/Zero dependencies/i);
  });

  it('quotes an engines range matching package.json', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    const min = /(\d+\.\d+)/.exec(pkg.engines.node)?.[1];
    expect(README).toContain(`Node ≥ ${min}`);
  });
});
