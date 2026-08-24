import { parsePathData } from '../raster/path.js';
import type { Scene, SceneItem } from '../render/scene.js';
import type { Fill } from '../render/types.js';
import { parseColor } from '../validate/contrast.js';
import type { EmbeddedImage } from './image.js';

/** Points per millimetre. PDF's default unit is 1/72 inch. */
const PT_PER_MM = 72 / 25.4;

const f = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const rgb = (color: string): [number, number, number] => {
  const parsed = parseColor(color) ?? { r: 0, g: 0, b: 0 };
  return [parsed.r / 255, parsed.g / 255, parsed.b / 255];
};

/**
 * Escape a string literal for a PDF content stream.
 *
 * Non-ASCII is dropped rather than encoded: the whole file is assembled as a
 * JavaScript string and its byte offsets go straight into the xref table, so a
 * single multi-byte character would shift every offset after it and break the
 * document. Titles are cosmetic; a correct xref is not.
 */
const pdfString = (value: string): string =>
  value
    .replace(/[^\u0020-\u007e]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

/**
 * Rough advance width per character for Helvetica-Bold, used only to centre the
 * label. Exact centring would need the font's metrics table; for a short call to
 * action the error is a fraction of a millimetre and not worth embedding 95
 * width values to remove.
 */
const AVERAGE_ADVANCE = 0.58;

type ShadingRef = { name: string; object: string };

/**
 * Emit the path operators for a scene item, in PDF's coordinate space.
 * `scale` converts module units to points; the caller has already flipped Y.
 */
const pathOperators = (d: string, dx: number, dy: number, scale: number): string => {
  const parts: string[] = [];
  for (const sub of parsePathData(d)) {
    parts.push(`${f((sub.start.x + dx) * scale)} ${f((sub.start.y + dy) * scale)} m`);
    for (const seg of sub.segments) {
      if (seg.kind === 'line') {
        parts.push(`${f((seg.x + dx) * scale)} ${f((seg.y + dy) * scale)} l`);
      } else {
        parts.push(
          `${f((seg.x1 + dx) * scale)} ${f((seg.y1 + dy) * scale)} ` +
            `${f((seg.x2 + dx) * scale)} ${f((seg.y2 + dy) * scale)} ` +
            `${f((seg.x + dx) * scale)} ${f((seg.y + dy) * scale)} c`,
        );
      }
    }
    parts.push('h');
  }
  return parts.join('\n');
};

/**
 * Build the shading dictionary for a gradient fill.
 *
 * Multi-stop gradients need a stitching function (type 3) wrapping one
 * exponential function (type 2) per adjacent pair of stops, because a single
 * type 2 function only interpolates between two colours.
 */
const shadingObject = (fill: Fill, x0: number, y0: number, x1: number, y1: number): string => {
  if (fill.kind === 'solid') return '';

  const stops = [...fill.stops].sort((a, b) => a.offset - b.offset);
  const first = stops[0] ?? { offset: 0, color: '#000000' };
  const last = stops[stops.length - 1] ?? first;

  let fn: string;
  if (stops.length <= 2) {
    const [r0, g0, b0] = rgb(first.color);
    const [r1, g1, b1] = rgb(last.color);
    fn = `<< /FunctionType 2 /Domain [0 1] /C0 [${f(r0)} ${f(g0)} ${f(b0)}] /C1 [${f(r1)} ${f(g1)} ${f(b1)}] /N 1 >>`;
  } else {
    const functions: string[] = [];
    const bounds: string[] = [];
    const encode: string[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const [ar, ag, ab] = rgb(stops[i].color);
      const [br, bg, bb] = rgb(stops[i + 1].color);
      functions.push(
        `<< /FunctionType 2 /Domain [0 1] /C0 [${f(ar)} ${f(ag)} ${f(ab)}] /C1 [${f(br)} ${f(bg)} ${f(bb)}] /N 1 >>`,
      );
      if (i > 0) bounds.push(f(stops[i].offset));
      encode.push('0 1');
    }
    fn =
      `<< /FunctionType 3 /Domain [0 1] /Functions [${functions.join(' ')}] ` +
      `/Bounds [${bounds.join(' ')}] /Encode [${encode.join(' ')}] >>`;
  }

  if (fill.kind === 'linear') {
    return (
      `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${f(x0)} ${f(y0)} ${f(x1)} ${f(y1)}] ` +
      `/Function ${fn} /Extend [true true] >>`
    );
  }

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const radius = Math.hypot(x1 - x0, y1 - y0) / 2;
  return (
    `<< /ShadingType 3 /ColorSpace /DeviceRGB ` +
    `/Coords [${f(cx)} ${f(cy)} 0 ${f(cx)} ${f(cy)} ${f(radius * 1.4)}] ` +
    `/Function ${fn} /Extend [true true] >>`
  );
};

export type PdfOptions = {
  /** Printed side length in millimetres. */
  sideMm?: number;
  /** Document title, written into the info dictionary. */
  title?: string;
  /**
   * Decoded logo samples, keyed by href. Images the map does not cover are
   * skipped, which is what happens outside a browser.
   */
  images?: Map<string, EmbeddedImage>;
};

type PendingImage = { name: string; image: EmbeddedImage };

/**
 * Write the scene as a single-page PDF.
 *
 * Everything is real vector geometry — paths, not a traced raster — so it scales
 * to any print size. Label text uses Helvetica-Bold, one of the fourteen fonts
 * every PDF reader is required to provide, which is why nothing has to be
 * embedded and the file stays dependency-free.
 */
export const sceneToPdf = (scene: Scene, options: PdfOptions = {}): Uint8Array => {
  const { sideMm = 40, title = 'QR Code' } = options;
  const scale = (sideMm * PT_PER_MM) / scene.width;
  const pageW = scene.width * scale;
  const pageH = scene.height * scale;

  const content: string[] = [];
  const shadings: ShadingRef[] = [];
  const fonts = new Set<string>();
  const images: PendingImage[] = [];

  // PDF's origin is bottom-left with Y up; the scene is top-left with Y down.
  content.push('q', `1 0 0 -1 0 ${f(pageH)} cm`);

  const paint = (fill: Fill, drawPath: () => void, evenOdd: boolean, bbox: number[]) => {
    if (fill.kind === 'solid') {
      const [r, g, b] = rgb(fill.color);
      content.push(`${f(r)} ${f(g)} ${f(b)} rg`);
      drawPath();
      content.push(evenOdd ? 'f*' : 'f');
      return;
    }

    // A gradient cannot fill a path directly: clip to the path, then paint the
    // shading across the clipped region.
    const [bx0, by0, bx1, by1] = bbox;
    const angle = fill.kind === 'linear' ? ((fill.angle % 360) * Math.PI) / 180 : 0;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    const half = Math.max(bx1 - bx0, by1 - by0) / 2;
    const name = `Sh${shadings.length}`;
    shadings.push({
      name,
      object: shadingObject(
        fill,
        cx - Math.cos(angle) * half,
        cy - Math.sin(angle) * half,
        cx + Math.cos(angle) * half,
        cy + Math.sin(angle) * half,
      ),
    });

    content.push('q');
    drawPath();
    content.push(evenOdd ? 'W* n' : 'W n');
    content.push(`/${name} sh`, 'Q');
  };

  const full = [0, 0, scene.width * scale, scene.height * scale];

  for (const item of scene.items as SceneItem[]) {
    switch (item.kind) {
      case 'rect': {
        const x = item.x * scale;
        const y = item.y * scale;
        const w = item.w * scale;
        const h = item.h * scale;
        paint(item.fill, () => content.push(`${f(x)} ${f(y)} ${f(w)} ${f(h)} re`), false, [
          x,
          y,
          x + w,
          y + h,
        ]);
        break;
      }
      case 'path': {
        const dx = item.inCode ? scene.codeOffset.x : 0;
        const dy = item.inCode ? scene.codeOffset.y : 0;
        paint(
          item.fill,
          () => content.push(pathOperators(item.d, dx, dy, scale)),
          item.evenOdd,
          full,
        );
        break;
      }
      case 'text': {
        fonts.add('Helvetica-Bold');
        const [r, g, b] = rgb(item.color);
        const size = item.size * scale;
        const estimated = item.text.length * size * AVERAGE_ADVANCE;
        const tx = item.x * scale - estimated / 2;
        // Text is drawn in unflipped space, so undo the page flip locally.
        const ty = pageH - item.y * scale - size * 0.35;
        content.push(
          'q',
          `1 0 0 -1 0 ${f(pageH)} cm`,
          'BT',
          `/F1 ${f(size)} Tf`,
          `${f(r)} ${f(g)} ${f(b)} rg`,
          `1 0 0 1 ${f(tx)} ${f(pageH - ty)} Tm`,
          `(${pdfString(item.text)}) Tj`,
          'ET',
          'Q',
        );
        break;
      }
      case 'image': {
        const embedded = options.images?.get(item.href);
        if (!embedded) break;

        const name = `Im${images.length}`;
        images.push({ name, image: embedded });

        const x = item.x * scale;
        const y = item.y * scale;
        const w = item.w * scale;
        const h = item.h * scale;

        // An image fills the unit square with its first row of samples along
        // the top edge. Y is already flipped here, so the height term is
        // negated and the origin moved to the bottom to keep the logo upright.
        content.push('q', `${f(w)} 0 0 ${f(-h)} ${f(x)} ${f(y + h)} cm`, `/${name} Do`, 'Q');
        break;
      }
      default:
        break;
    }
  }

  content.push('Q');
  const stream = content.join('\n');

  const objects: string[] = [];
  const resourceParts: string[] = [];
  if (fonts.size > 0) {
    resourceParts.push(
      '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >>',
    );
  }
  if (shadings.length > 0) {
    resourceParts.push(`/Shading << ${shadings.map((s) => `/${s.name} ${s.object}`).join(' ')} >>`);
  }

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  // The page dictionary names every XObject, so it is filled in below once the
  // image objects exist and their numbers are known.
  const pageSlot = objects.push('') - 1;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objects.push(`<< /Title (${pdfString(title)}) /Producer (QR Studio) >>`);
  const infoNumber = objects.length;

  const xobjects: string[] = [];
  for (const { name, image } of images) {
    const filter = image.deflated ? '[/ASCII85Decode /FlateDecode]' : '/ASCII85Decode';

    let smask = '';
    if (image.alpha) {
      objects.push(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter ${filter} ` +
          `/Length ${image.alpha.length} >>\nstream\n${image.alpha}\nendstream`,
      );
      smask = ` /SMask ${objects.length} 0 R`;
    }

    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter}${smask} ` +
        `/Length ${image.rgb.length} >>\nstream\n${image.rgb}\nendstream`,
    );
    xobjects.push(`/${name} ${objects.length} 0 R`);
  }
  if (xobjects.length > 0) resourceParts.push(`/XObject << ${xobjects.join(' ')} >>`);

  objects[pageSlot] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] ` +
    `/Resources << ${resourceParts.join(' ')} >> /Contents 4 0 R >>`;

  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNumber} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
};
