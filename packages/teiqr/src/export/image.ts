/**
 * Embed raster logos into the vector formats.
 *
 * PDF and PostScript cannot point at an external file and still be
 * self-contained, so the logo's pixels have to travel inside the document. That
 * means decoding the image, splitting colour from transparency, compressing
 * both, and encoding the result as ASCII85.
 *
 * ### No canvas
 * The obvious way to decode a data URI is to draw it to a canvas and read the
 * pixels back — which is what the browser-only implementations do, and why
 * their PDF export silently produces a logo-less document on a server. This
 * module uses the package's own PNG decoder and DEFLATE compressor instead, so
 * embedding is synchronous and works identically in Node, Workers and the
 * browser.
 */

import { zlibDeflate } from '../raster/deflate.js';
import { decodePng } from '../raster/png.js';
import type { Scene } from '../render/scene.js';

export interface EmbeddedImage {
  readonly width: number;
  readonly height: number;
  /** ASCII85 text of the RGB samples, three bytes per pixel. */
  readonly rgb: string;
  /** ASCII85 text of the 8-bit alpha channel; null when the image is opaque. */
  readonly alpha: string | null;
  /** Whether the samples went through DEFLATE before ASCII85. */
  readonly deflated: boolean;
}

export interface EmbedOptions {
  /**
   * Composite transparency onto this colour and drop the alpha channel.
   * Used by EPS, which has no soft mask worth relying on across RIPs.
   */
  flattenOver?: string | null;
}

const hexToRgb = (color: string): [number, number, number] => {
  const value = color.trim().replace(/^#/, '');
  if (value.length === 3) {
    const [r, g, b] = value;
    return [
      Number.parseInt(r + r, 16) || 0,
      Number.parseInt(g + g, 16) || 0,
      Number.parseInt(b + b, 16) || 0,
    ];
  }
  if (value.length >= 6) {
    return [
      Number.parseInt(value.slice(0, 2), 16) || 0,
      Number.parseInt(value.slice(2, 4), 16) || 0,
      Number.parseInt(value.slice(4, 6), 16) || 0,
    ];
  }
  return [255, 255, 255];
};

/**
 * ASCII85 as PDF and PostScript define it: five printable characters per four
 * bytes, `z` for an all-zero group, terminated with `~>`.
 *
 * Lines are wrapped short. A single multi-megabyte line is legal PostScript but
 * upsets conservative DSC parsers, and the EPS writer indents each line so no
 * line of data can ever start with `%` — which a DSC parser would read as a
 * comment and the document would break.
 */
export const ascii85 = (bytes: Uint8Array): string => {
  const out: string[] = [];
  let line = '';

  const push = (text: string): void => {
    line += text;
    if (line.length >= 72) {
      out.push(line);
      line = '';
    }
  };

  for (let i = 0; i < bytes.length; i += 4) {
    const remaining = Math.min(4, bytes.length - i);
    let group = 0;
    for (let j = 0; j < 4; j++) {
      group = group * 256 + (j < remaining ? bytes[i + j] : 0);
    }

    if (remaining === 4 && group === 0) {
      push('z');
      continue;
    }

    const chars = new Array<string>(5);
    let value = group;
    for (let j = 4; j >= 0; j--) {
      chars[j] = String.fromCharCode(33 + (value % 85));
      value = Math.floor(value / 85);
    }
    // A partial final group emits one character more than it has bytes.
    push(chars.slice(0, remaining + 1).join(''));
  }

  if (line) out.push(line);
  out.push('~>');
  return out.join('\n');
};

/** Split an RGBA buffer into the streams the vector formats want. */
export const packImage = (
  decoded: { width: number; height: number; data: Uint8Array },
  options: EmbedOptions = {},
): EmbeddedImage => {
  const { width, height, data } = decoded;
  const pixels = width * height;
  const ground = options.flattenOver ? hexToRgb(options.flattenOver) : null;

  const rgb = new Uint8Array(pixels * 3);
  const alpha = new Uint8Array(pixels);
  let opaque = true;

  for (let i = 0; i < pixels; i++) {
    const a = data[i * 4 + 3];
    if (a !== 255) opaque = false;
    alpha[i] = a;

    for (let c = 0; c < 3; c++) {
      const sample = data[i * 4 + c];
      rgb[i * 3 + c] = ground
        ? Math.round((sample * a + ground[c] * (255 - a)) / 255)
        : // Left unpremultiplied: PDF composites it against the page itself
          // using the soft mask, and doing it twice darkens soft edges.
          sample;
    }
  }

  const keepAlpha = !(ground || opaque);
  const rgbBytes = zlibDeflate(rgb);
  const alphaBytes = keepAlpha ? zlibDeflate(alpha) : null;

  return {
    width,
    height,
    rgb: ascii85(rgbBytes),
    alpha: keepAlpha && alphaBytes ? ascii85(alphaBytes) : null,
    deflated: true,
  };
};

/**
 * The single colour that lies beneath the logo.
 *
 * EPS flattens transparency, so it needs somewhere to composite onto. The logo
 * sits dead centre, which is why a gradient's middle stop is the closest honest
 * answer rather than its first.
 */
export const groundUnderLogo = (scene: Scene): string => {
  const plate = scene.style.logo?.background;
  if (plate) return plate;

  const background = scene.style.background;
  if (!background) return '#ffffff';
  if (background.kind === 'solid') return background.color;

  const stops = [...background.stops].sort((a, b) => a.offset - b.offset);
  return stops[Math.floor(stops.length / 2)]?.color ?? '#ffffff';
};

/** Decode a PNG data URI. Returns null for anything this package cannot read. */
const decodeHref = (href: string): { width: number; height: number; data: Uint8Array } | null => {
  const match = /^data:image\/png;base64,(.*)$/is.exec(href.trim());
  if (!match) return null;
  try {
    const base64 = match[1];
    const bytes =
      typeof atob === 'function'
        ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        : new Uint8Array(Buffer.from(base64, 'base64'));
    const { pixels, width, height } = decodePng(bytes);
    return { width, height, data: pixels };
  } catch {
    return null;
  }
};

/**
 * Decode every image in the scene, keyed by its href.
 *
 * An empty map is a valid result: a logo in a format this package cannot decode
 * is skipped, and the writers emit the code alone rather than failing the whole
 * export. Callers that need to know can compare the map's size against the
 * number of image items in the scene.
 */
export const embedImages = (
  scene: Scene,
  options: EmbedOptions = {},
): Map<string, EmbeddedImage> => {
  const hrefs = new Set(
    scene.items.filter((item) => item.kind === 'image').map((item) => item.href),
  );

  const embedded = new Map<string, EmbeddedImage>();
  for (const href of hrefs) {
    const decoded = decodeHref(href);
    if (decoded) embedded.set(href, packImage(decoded, options));
  }
  return embedded;
};
