import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isHexColor, parseSizes, validateSource } from '../../../src/services/favicon/validate';

const tmpRoots: string[] = [];

const mktmp = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'next-maker-favicon-'));
  tmpRoots.push(dir);
  return dir;
};

afterAll(async () => {
  // best-effort cleanup; on test failure we leave tmp dirs for inspection
});

describe('validateSource', () => {
  it('throws when source path is missing', async () => {
    await expect(validateSource('')).rejects.toThrow(/required/);
  });

  it('throws when source does not exist', async () => {
    await expect(validateSource('/no/such/file/zzz.png')).rejects.toThrow(/not found/);
  });

  it('throws when extension is unsupported', async () => {
    const dir = await mktmp();
    const f = path.join(dir, 'logo.bmp');
    await writeFile(f, 'x');
    await expect(validateSource(f)).rejects.toThrow(/Unsupported source format/);
  });

  it('accepts a supported extension and reports vector-ness', async () => {
    const dir = await mktmp();
    const png = path.join(dir, 'logo.png');
    const svg = path.join(dir, 'logo.svg');
    await writeFile(png, 'binary');
    await writeFile(svg, '<svg/>');
    const pngInfo = await validateSource(png);
    expect(pngInfo.ext).toBe('.png');
    expect(pngInfo.isVector).toBe(false);
    const svgInfo = await validateSource(svg);
    expect(svgInfo.isVector).toBe(true);
  });
});

describe('isHexColor', () => {
  it.each([
    ['#fff', true],
    ['#FFFFFF', true],
    ['#abcdef12', true],
    ['fff', false],
    ['#xyz', false],
    ['', false],
  ])('isHexColor(%s) = %s', (input, expected) => {
    expect(isHexColor(input)).toBe(expected);
  });
});

describe('parseSizes', () => {
  it('returns fallback when input is undefined', () => {
    expect(parseSizes(undefined, [16, 32, 48])).toEqual([16, 32, 48]);
  });

  it('parses comma-separated numbers and drops invalid ones', () => {
    expect(parseSizes('16,32,foo,48', [])).toEqual([16, 32, 48]);
  });

  it('throws when no valid sizes parsed', () => {
    expect(() => parseSizes('foo,bar', [])).toThrow(/Invalid --sizes/);
  });
});
