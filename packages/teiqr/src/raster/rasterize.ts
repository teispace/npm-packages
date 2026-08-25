/**
 * A scanline polygon rasteriser with anti-aliasing.
 *
 * This is what lets the library produce PNG without a canvas. The renderer
 * already describes a symbol as a device-independent {@link Scene} of filled
 * paths, so rasterising it needs only three things: flatten the cubics to
 * polylines, fill the resulting polygons with a winding rule, and evaluate a
 * paint per pixel. None of that needs a DOM.
 *
 * ### Approach
 * Each pixel row is sampled at several sub-row heights. For every sub-row the
 * active edges are intersected, sorted, and walked to find inside spans, whose
 * fractional endpoints contribute partial coverage to the end pixels. Vertical
 * anti-aliasing therefore comes from supersampling and horizontal from exact
 * span arithmetic — which is both cheaper and sharper than supersampling both
 * axes, and matters here because QR modules are axis-aligned rectangles whose
 * vertical edges must stay perfectly crisp.
 */

import type { Fill } from '../render/types.js';
import { parseColor } from '../validate/contrast.js';
import { parsePathData, type SubPath } from './path.js';

/** Sub-rows sampled per pixel row. Four is the usual quality/speed sweet spot. */
const SUBSAMPLES = 4;

/** Flatness threshold in device pixels for cubic subdivision. */
const FLATNESS = 0.2;

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** +1 when the edge runs downward, -1 upward. Drives the nonzero rule. */
  winding: number;
}

/** Split a cubic until each piece is flat enough to draw as a line. */
const flattenCubic = (
  out: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  depth = 0,
): void => {
  // Distance of the control points from the chord approximates the error.
  const dx = x3 - x0;
  const dy = y3 - y0;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  const sum = d1 + d2;

  if (depth > 16 || sum * sum <= FLATNESS * (dx * dx + dy * dy)) {
    out.push(x3, y3);
    return;
  }

  // de Casteljau split at t = 0.5.
  const x01 = (x0 + x1) / 2,
    y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2,
    y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2,
    y23 = (y2 + y3) / 2;
  const x012 = (x01 + x12) / 2,
    y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2,
    y123 = (y12 + y23) / 2;
  const xm = (x012 + x123) / 2,
    ym = (y012 + y123) / 2;

  flattenCubic(out, x0, y0, x01, y01, x012, y012, xm, ym, depth + 1);
  flattenCubic(out, xm, ym, x123, y123, x23, y23, x3, y3, depth + 1);
};

/** Transform applied to path coordinates on the way to device pixels. */
export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Convert sub-paths into device-space edges, closing every contour. */
const toEdges = (subpaths: SubPath[], t: Transform): Edge[] => {
  const edges: Edge[] = [];

  for (const sub of subpaths) {
    const points: number[] = [];
    let cx = sub.start.x * t.scale + t.offsetX;
    let cy = sub.start.y * t.scale + t.offsetY;
    points.push(cx, cy);

    for (const seg of sub.segments) {
      if (seg.kind === 'line') {
        cx = seg.x * t.scale + t.offsetX;
        cy = seg.y * t.scale + t.offsetY;
        points.push(cx, cy);
      } else {
        const x1 = seg.x1 * t.scale + t.offsetX;
        const y1 = seg.y1 * t.scale + t.offsetY;
        const x2 = seg.x2 * t.scale + t.offsetX;
        const y2 = seg.y2 * t.scale + t.offsetY;
        const x3 = seg.x * t.scale + t.offsetX;
        const y3 = seg.y * t.scale + t.offsetY;
        flattenCubic(points, cx, cy, x1, y1, x2, y2, x3, y3);
        cx = x3;
        cy = y3;
      }
    }

    // Implicit close: every filled contour is a closed polygon.
    for (let i = 0; i + 3 < points.length; i += 2) {
      const ax = points[i],
        ay = points[i + 1];
      const bx = points[i + 2],
        by = points[i + 3];
      if (ay !== by) edges.push({ x0: ax, y0: ay, x1: bx, y1: by, winding: by > ay ? 1 : -1 });
    }
    const lastX = points[points.length - 2];
    const lastY = points[points.length - 1];
    const firstX = points[0];
    const firstY = points[1];
    if (lastY !== firstY) {
      edges.push({
        x0: lastX,
        y0: lastY,
        x1: firstX,
        y1: firstY,
        winding: firstY > lastY ? 1 : -1,
      });
    }
  }

  return edges;
};

/** Returns the colour and alpha at a device pixel, 0-255 per channel. */
export type PixelPaint = (x: number, y: number) => readonly [number, number, number, number];

const SOLID_BLACK: readonly [number, number, number, number] = [0, 0, 0, 255];

/**
 * Build a {@link Paint} for a {@link Fill}, matching how the SVG renderer
 * resolves the same fill.
 *
 * Gradients are defined in the object bounding box of what they paint, so the
 * bounding box is passed in and coordinates are normalised into it — the same
 * convention as SVG's default `gradientUnits="objectBoundingBox"`, which keeps
 * PNG and SVG output visually identical.
 */
export const makePaint = (
  fill: Fill,
  box: { x: number; y: number; w: number; h: number },
): PixelPaint => {
  if (fill.kind === 'solid') {
    const rgb = parseColor(fill.color);
    const alpha = alphaOf(fill.color);
    const colour = rgb ? ([rgb.r, rgb.g, rgb.b, alpha] as const) : SOLID_BLACK;
    return () => colour;
  }

  const stops = fill.stops
    .map((s) => ({
      offset: Math.min(1, Math.max(0, s.offset)),
      rgb: parseColor(s.color),
      a: alphaOf(s.color),
    }))
    .filter(
      (s): s is { offset: number; rgb: { r: number; g: number; b: number }; a: number } =>
        s.rgb !== null,
    )
    .sort((a, b) => a.offset - b.offset);

  if (stops.length === 0) return () => SOLID_BLACK;
  if (stops.length === 1) {
    const only = [stops[0].rgb.r, stops[0].rgb.g, stops[0].rgb.b, stops[0].a] as const;
    return () => only;
  }

  const sample = (t: number): readonly [number, number, number, number] => {
    const u = Math.min(1, Math.max(0, t));
    if (u <= stops[0].offset) {
      const s = stops[0];
      return [s.rgb.r, s.rgb.g, s.rgb.b, s.a];
    }
    for (let i = 1; i < stops.length; i++) {
      if (u <= stops[i].offset) {
        const a = stops[i - 1];
        const b = stops[i];
        const span = b.offset - a.offset;
        const k = span === 0 ? 0 : (u - a.offset) / span;
        return [
          Math.round(a.rgb.r + (b.rgb.r - a.rgb.r) * k),
          Math.round(a.rgb.g + (b.rgb.g - a.rgb.g) * k),
          Math.round(a.rgb.b + (b.rgb.b - a.rgb.b) * k),
          Math.round(a.a + (b.a - a.a) * k),
        ];
      }
    }
    const last = stops[stops.length - 1];
    return [last.rgb.r, last.rgb.g, last.rgb.b, last.a];
  };

  if (fill.kind === 'linear') {
    // Same unit-square axis the SVG renderer derives from the angle.
    const radians = ((fill.angle % 360) * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    return (px, py) => {
      const u = box.w === 0 ? 0.5 : (px - box.x) / box.w - 0.5;
      const v = box.h === 0 ? 0.5 : (py - box.y) / box.h - 0.5;
      return sample(0.5 + u * dx + v * dy);
    };
  }

  // Radial, centred with r = 0.7 to match the SVG definition.
  return (px, py) => {
    const u = box.w === 0 ? 0 : (px - box.x) / box.w - 0.5;
    const v = box.h === 0 ? 0 : (py - box.y) / box.h - 0.5;
    return sample(Math.sqrt(u * u + v * v) / 0.7);
  };
};

/** Alpha channel of a colour literal, 0-255. Opaque unless #rgba/#rrggbbaa. */
const alphaOf = (color: string): number => {
  const hex = color.trim().replace(/^#/, '');
  if (hex.length === 4) return Number.parseInt(hex[3] + hex[3], 16);
  if (hex.length === 8) return Number.parseInt(hex.slice(6, 8), 16);
  return 255;
};

/** An RGBA canvas that owns its pixel buffer. */
export class Raster {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height * 4);
  }

  /** Fill the whole surface with an opaque colour. */
  clear(r: number, g: number, b: number, a = 255): void {
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = r;
      this.pixels[i + 1] = g;
      this.pixels[i + 2] = b;
      this.pixels[i + 3] = a;
    }
  }

  /** Source-over blend of one pixel at the given coverage (0-1). */
  private blend(x: number, y: number, paint: PixelPaint, coverage: number): void {
    if (coverage <= 0) return;
    const [r, g, b, a] = paint(x + 0.5, y + 0.5);
    const alpha = (a / 255) * Math.min(1, coverage);
    if (alpha <= 0) return;

    const i = (y * this.width + x) * 4;
    const dstA = this.pixels[i + 3] / 255;
    const outA = alpha + dstA * (1 - alpha);
    if (outA <= 0) {
      this.pixels[i] = this.pixels[i + 1] = this.pixels[i + 2] = this.pixels[i + 3] = 0;
      return;
    }
    // Non-premultiplied source-over, which is what PNG stores.
    this.pixels[i] = Math.round((r * alpha + this.pixels[i] * dstA * (1 - alpha)) / outA);
    this.pixels[i + 1] = Math.round((g * alpha + this.pixels[i + 1] * dstA * (1 - alpha)) / outA);
    this.pixels[i + 2] = Math.round((b * alpha + this.pixels[i + 2] * dstA * (1 - alpha)) / outA);
    this.pixels[i + 3] = Math.round(outA * 255);
  }

  /**
   * Fill sub-paths with the given winding rule and paint.
   *
   * Coverage is accumulated into one scratch row at a time, so memory stays
   * proportional to the width rather than the whole canvas.
   */
  fill(subpaths: SubPath[], evenOdd: boolean, paint: PixelPaint, transform: Transform): void {
    const edges = toEdges(subpaths, transform);
    if (edges.length === 0) return;

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const e of edges) {
      minY = Math.min(minY, e.y0, e.y1);
      maxY = Math.max(maxY, e.y0, e.y1);
    }
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.height - 1, Math.ceil(maxY));
    if (yEnd < yStart) return;

    const coverage = new Float32Array(this.width);
    const crossings: { x: number; winding: number }[] = [];
    const weight = 1 / SUBSAMPLES;

    /**
     * Edges sorted by the first scanline they touch, plus an active set.
     *
     * Without this every edge was tested against every sub-scanline, and
     * almost all of those tests were immediate rejections: a version-11 symbol
     * at scale 8 is 520 rows of 4 sub-samples against roughly 3,200 edges, so
     * 6.7 million comparisons to find the hundred or so that matter. Since
     * `sampleY` only ever increases, edges can be admitted once as the scan
     * reaches them and dropped once it passes them.
     */
    const sorted = [...edges].sort((a, b) => Math.min(a.y0, a.y1) - Math.min(b.y0, b.y1));
    const bounds = sorted.map((e) => ({
      edge: e,
      lo: Math.min(e.y0, e.y1),
      hi: Math.max(e.y0, e.y1),
    }));
    let admitted = 0;
    let active: { edge: Edge; lo: number; hi: number }[] = [];

    for (let y = yStart; y <= yEnd; y++) {
      coverage.fill(0);
      let touched = false;

      for (let s = 0; s < SUBSAMPLES; s++) {
        const sampleY = y + (s + 0.5) / SUBSAMPLES;
        crossings.length = 0;

        // Admit every edge that has come into range, then drop the ones the
        // scan has passed. Both are cheap because `sampleY` is monotonic.
        while (admitted < bounds.length && bounds[admitted].lo <= sampleY) {
          active.push(bounds[admitted++]);
        }
        if (active.some((a) => a.hi <= sampleY)) {
          active = active.filter((a) => a.hi > sampleY);
        }

        for (const { edge: e, lo } of active) {
          // Half-open in y so a vertex shared by two edges counts exactly once.
          if (sampleY < lo) continue;
          const t = (sampleY - e.y0) / (e.y1 - e.y0);
          crossings.push({ x: e.x0 + t * (e.x1 - e.x0), winding: e.winding });
        }
        if (crossings.length < 2) continue;
        crossings.sort((a, b) => a.x - b.x);

        let winding = 0;
        for (let i = 0; i < crossings.length - 1; i++) {
          winding += crossings[i].winding;
          const inside = evenOdd ? (i & 1) === 0 : winding !== 0;
          if (!inside) continue;

          const spanStart = crossings[i].x;
          const spanEnd = crossings[i + 1].x;
          if (spanEnd <= 0 || spanStart >= this.width) continue;
          touched = true;

          const from = Math.max(0, spanStart);
          const to = Math.min(this.width, spanEnd);
          const firstPixel = Math.floor(from);
          const lastPixel = Math.min(this.width - 1, Math.floor(to - 1e-9));

          if (firstPixel === lastPixel) {
            coverage[firstPixel] += (to - from) * weight;
          } else {
            // Fractional coverage at both ends, full coverage in between.
            coverage[firstPixel] += (firstPixel + 1 - from) * weight;
            for (let x = firstPixel + 1; x < lastPixel; x++) coverage[x] += weight;
            coverage[lastPixel] += (to - lastPixel) * weight;
          }
        }
      }

      if (!touched) continue;
      for (let x = 0; x < this.width; x++) {
        if (coverage[x] > 0.0005) this.blend(x, y, paint, coverage[x]);
      }
    }
  }

  /** Convenience: fill SVG path data directly. */
  fillPath(d: string, evenOdd: boolean, paint: PixelPaint, transform: Transform): void {
    this.fill(parsePathData(d), evenOdd, paint, transform);
  }
}

export type { SubPath };
export { parsePathData };
