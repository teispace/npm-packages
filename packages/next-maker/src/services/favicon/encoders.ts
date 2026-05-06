import { readFile } from 'node:fs/promises';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import { buildBackground, buildShapeMask } from './shapes';
import type { FaviconFit, FaviconShape } from './types';

export interface RenderOptions {
  source: string;
  size: number;
  shape: FaviconShape;
  radiusPercent: number;
  bg: string;
  paddingPercent: number;
  fit: FaviconFit;
  /** Compress level for PNG. */
  quality: number;
  /** When true, never apply shape clipping (used for ICO frames). */
  forceSquare?: boolean;
}

/**
 * Render a single PNG buffer at the requested size, applying fit/padding/bg/shape.
 */
export const renderPng = async (opts: RenderOptions): Promise<Buffer> => {
  const { size, paddingPercent, bg, fit, shape, radiusPercent, quality, forceSquare, source } =
    opts;

  const sourceInput = await readFile(source);
  const innerSize = Math.max(1, Math.round(size * (1 - (paddingPercent * 2) / 100)));

  // Stage 1: resize the source content to innerSize, with the chosen fit.
  const sharpFit = fit === 'cover' ? 'cover' : 'contain';
  const resized = await sharp(sourceInput, { density: 384 })
    .resize(innerSize, innerSize, {
      fit: sharpFit,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Stage 2: place onto a `size`-square canvas (handles padding via offset).
  const offset = Math.round((size - innerSize) / 2);
  const canvasBg = bg === 'transparent' ? { r: 0, g: 0, b: 0, alpha: 0 } : await flatColor(bg);

  let composed = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: canvasBg,
    },
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toBuffer();

  // Stage 3: shape clipping (skip for ICO frames where we always want square).
  const effectiveShape: FaviconShape = forceSquare ? 'square' : shape;
  if (effectiveShape !== 'square' || fit === 'clip') {
    const clipShape: FaviconShape = effectiveShape === 'square' ? 'rounded' : effectiveShape;
    const mask = Buffer.from(buildShapeMask(clipShape, size, radiusPercent));
    composed = await sharp(composed)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png({ compressionLevel: clampCompression(quality) })
      .toBuffer();
  } else {
    // Re-encode at the requested compression level.
    composed = await sharp(composed)
      .png({ compressionLevel: clampCompression(quality) })
      .toBuffer();
  }

  return composed;
};

export const flatColor = async (color: string): Promise<sharp.Color> => {
  // Use sharp to parse arbitrary CSS color via a tiny SVG → first pixel.
  const probe = await sharp(Buffer.from(buildBackground(1, color)))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b, a = 255] = probe.data;
  return { r, g, b, alpha: a / 255 };
};

const clampCompression = (quality: number): number => {
  // sharp PNG compressionLevel: 0 (fastest, biggest) – 9 (slowest, smallest).
  // Map quality 1..100 inversely: high quality → high compression for small files.
  const n = Math.round(((100 - quality) / 100) * 9);
  return Math.max(0, Math.min(9, n));
};

/**
 * Build a multi-size ICO from a set of source PNG buffers.
 */
export const encodeIco = async (frames: Buffer[]): Promise<Buffer> => {
  if (frames.length === 0) throw new Error('No frames provided to encodeIco');
  return pngToIco(frames);
};
