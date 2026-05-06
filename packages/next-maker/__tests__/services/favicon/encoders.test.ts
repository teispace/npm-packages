import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderPng } from '../../../src/services/favicon/encoders';

const solidSquareSvg = (color: string): Buffer =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/></svg>`,
  );

describe('renderPng', () => {
  it('returns a PNG of the requested size', async () => {
    const out = await renderPng({
      sourceBuffer: solidSquareSvg('#ff0000'),
      size: 64,
      shape: 'square',
      radiusPercent: 0,
      bg: 'transparent',
      paddingPercent: 0,
      fit: 'contain',
      quality: 90,
    });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
  });

  it('keeps ICO frames opaque-square even when fit=clip is requested', async () => {
    // Regression: forceSquare must beat fit=clip so favicon.ico frames stay
    // rectangular regardless of the user's shape/fit choices.
    const out = await renderPng({
      sourceBuffer: solidSquareSvg('#0f172a'),
      size: 32,
      shape: 'circle',
      radiusPercent: 0,
      bg: '#ffffff',
      paddingPercent: 0,
      fit: 'clip',
      quality: 90,
      forceSquare: true,
    });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(32);
    expect(info.height).toBe(32);

    // All four corners should be opaque (alpha = 255). If clipping had been
    // applied we'd see alpha = 0 at the corners.
    const cornerAlpha = (x: number, y: number): number =>
      data[(y * info.width + x) * info.channels + 3];
    expect(cornerAlpha(0, 0)).toBe(255);
    expect(cornerAlpha(info.width - 1, 0)).toBe(255);
    expect(cornerAlpha(0, info.height - 1)).toBe(255);
    expect(cornerAlpha(info.width - 1, info.height - 1)).toBe(255);
  });

  it('clips corners to transparent when shape=circle and forceSquare is unset', async () => {
    const out = await renderPng({
      sourceBuffer: solidSquareSvg('#0f172a'),
      size: 64,
      shape: 'circle',
      radiusPercent: 0,
      bg: '#0f172a',
      paddingPercent: 0,
      fit: 'contain',
      quality: 90,
    });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const cornerAlpha = (x: number, y: number): number =>
      data[(y * info.width + x) * info.channels + 3];
    // Corners outside the circle should be cut to fully transparent.
    expect(cornerAlpha(0, 0)).toBe(0);
    expect(cornerAlpha(info.width - 1, info.height - 1)).toBe(0);
  });
});
