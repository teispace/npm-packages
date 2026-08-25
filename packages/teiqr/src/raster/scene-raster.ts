/**
 * Rasterise a {@link Scene} to RGBA pixels, then to PNG.
 *
 * The scene is the same description SVG, PDF and EPS serialise from, so a PNG
 * produced here is geometrically identical to the SVG of the same symbol —
 * there is no second code path to drift.
 */

import type { QrMatrix } from '../core/types.js';
import { buildScene, type Scene, type SceneItem } from '../render/scene.js';
import { roundedRect } from '../render/shapes.js';
import type { Fill, QrStyle } from '../render/types.js';
import { decodePng, encodePng, type PngOptions } from './png.js';
import { makePaint, parsePathData, Raster, type Transform } from './rasterize.js';

export interface RasterOptions {
  /**
   * Device pixels per module. Overrides the style's `moduleSize`. A printed
   * code wants roughly 10-20; a favicon-sized one, 2-4.
   */
  scale?: number;
  /** Exact output width in pixels. Takes precedence over `scale`. */
  width?: number;
  /**
   * Colour composited underneath the whole image, for formats without alpha.
   * `null` (the default) keeps transparency.
   */
  background?: string | null;
}

export interface RasterResult {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  /**
   * Scene features this rasteriser could not draw. Empty for every symbol that
   * does not use a frame label or a non-PNG logo — see the notes on each below.
   */
  readonly omitted: readonly string[];
}

/** Bounding box of path data, used to place gradients the way SVG does. */
const pathBounds = (d: string, t: Transform): { x: number; y: number; w: number; h: number } => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const sub of parsePathData(d)) {
    const visit = (px: number, py: number): void => {
      const x = px * t.scale + t.offsetX;
      const y = py * t.scale + t.offsetY;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    visit(sub.start.x, sub.start.y);
    for (const seg of sub.segments) {
      if (seg.kind === 'cubic') {
        // Control points bound the curve, which is enough for gradient placement.
        visit(seg.x1, seg.y1);
        visit(seg.x2, seg.y2);
      }
      visit(seg.x, seg.y);
    }
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** Decode a data-URI image to RGBA. PNG only; anything else returns null. */
const decodeDataUri = (
  href: string,
): { pixels: Uint8Array; width: number; height: number } | null => {
  const match = /^data:image\/png;base64,(.*)$/i.exec(href.trim());
  if (!match) return null;
  try {
    const base64 = match[1];
    const bytes =
      typeof atob === 'function'
        ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        : new Uint8Array(Buffer.from(base64, 'base64'));
    return decodePng(bytes);
  } catch {
    return null;
  }
};

/** Draw an image scaled into a device-space box, with nearest-neighbour sampling. */
const drawImage = (
  target: Raster,
  image: { pixels: Uint8Array; width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
): void => {
  // `preserveAspectRatio="xMidYMid meet"`, matching the SVG renderer.
  const ratio = Math.min(w / image.width, h / image.height);
  const drawW = image.width * ratio;
  const drawH = image.height * ratio;
  const originX = x + (w - drawW) / 2;
  const originY = y + (h - drawH) / 2;

  const x0 = Math.max(0, Math.floor(originX));
  const y0 = Math.max(0, Math.floor(originY));
  const x1 = Math.min(target.width, Math.ceil(originX + drawW));
  const y1 = Math.min(target.height, Math.ceil(originY + drawH));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const sx = Math.floor(((px + 0.5 - originX) / drawW) * image.width);
      const sy = Math.floor(((py + 0.5 - originY) / drawH) * image.height);
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;

      const si = (sy * image.width + sx) * 4;
      const alpha = image.pixels[si + 3] / 255;
      if (alpha <= 0) continue;

      const di = (py * target.width + px) * 4;
      const dstA = target.pixels[di + 3] / 255;
      const outA = alpha + dstA * (1 - alpha);
      target.pixels[di] = Math.round(
        (image.pixels[si] * alpha + target.pixels[di] * dstA * (1 - alpha)) / outA,
      );
      target.pixels[di + 1] = Math.round(
        (image.pixels[si + 1] * alpha + target.pixels[di + 1] * dstA * (1 - alpha)) / outA,
      );
      target.pixels[di + 2] = Math.round(
        (image.pixels[si + 2] * alpha + target.pixels[di + 2] * dstA * (1 - alpha)) / outA,
      );
      target.pixels[di + 3] = Math.round(outA * 255);
    }
  }
};

/** Rasterise a built scene to RGBA pixels. */
export const rasterizeScene = (scene: Scene, options: RasterOptions = {}): RasterResult => {
  const scale =
    options.width !== undefined
      ? options.width / scene.width
      : (options.scale ?? scene.style.moduleSize);
  const width = Math.max(1, Math.round(scene.width * scale));
  const height = Math.max(1, Math.round(scene.height * scale));

  const target = new Raster(width, height);
  const omitted: string[] = [];

  if (options.background) {
    const paint = makePaint({ kind: 'solid', color: options.background } as Fill, {
      x: 0,
      y: 0,
      w: width,
      h: height,
    });
    const [r, g, b, a] = paint(0, 0);
    target.clear(r, g, b, a);
  }

  const outer: Transform = { scale, offsetX: 0, offsetY: 0 };
  const inCode: Transform = {
    scale,
    offsetX: scene.codeOffset.x * scale,
    offsetY: scene.codeOffset.y * scale,
  };

  const draw = (item: SceneItem): void => {
    switch (item.kind) {
      case 'rect': {
        const d = roundedRect(item.x, item.y, item.w, item.h, 0, 0, 0, 0);
        const box = pathBounds(d, outer);
        target.fill(parsePathData(d), false, makePaint(item.fill, box), outer);
        break;
      }
      case 'path': {
        const t = item.inCode ? inCode : outer;
        const box = pathBounds(item.d, t);
        target.fill(parsePathData(item.d), item.evenOdd, makePaint(item.fill, box), t);
        break;
      }
      case 'image': {
        const image = decodeDataUri(item.href);
        if (!image) {
          // Only PNG data URIs are decodable without an image library. SVG and
          // PDF export embed the original bytes untouched, so a JPEG logo is
          // fine there; it is specifically raster output that cannot show it.
          omitted.push('logo (only PNG data URIs can be rasterised)');
          break;
        }
        drawImage(target, image, item.x * scale, item.y * scale, item.w * scale, item.h * scale);
        break;
      }
      case 'text':
        // Drawing text needs a font engine and font data, which would dwarf
        // the rest of this package. SVG, PDF and EPS all render frame labels
        // correctly; raster output reports the omission rather than silently
        // dropping it.
        omitted.push('frame label text (use SVG or PDF for labelled codes)');
        break;
      default:
        break;
    }
  };

  for (const item of scene.items) draw(item);

  return { pixels: target.pixels, width, height, omitted };
};

/** Rasterise a symbol straight to RGBA pixels. */
export const rasterize = (
  matrix: QrMatrix,
  style: Partial<QrStyle> = {},
  options: RasterOptions = {},
): RasterResult => rasterizeScene(buildScene(matrix, style), options);

/**
 * Render a symbol as PNG bytes.
 *
 * Synchronous, dependency-free, and identical in Node, browsers, Cloudflare
 * Workers, Deno and Bun — no canvas, no native module, no build step.
 *
 * @example
 * const png = toPng(encode('https://example.com'), { moduleShape: 'rounded' }, { scale: 12 });
 * await writeFile('qr.png', png);
 */
export const toPng = (
  matrix: QrMatrix,
  style: Partial<QrStyle> = {},
  options: RasterOptions & PngOptions = {},
): Uint8Array => {
  const { pixels, width, height } = rasterize(matrix, style, options);
  return encodePng(pixels, width, height, options);
};
