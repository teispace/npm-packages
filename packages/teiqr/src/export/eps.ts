import { parsePathData } from '../raster/path.js';
import type { Scene } from '../render/scene.js';
import type { Fill } from '../render/types.js';
import { parseColor } from '../validate/contrast.js';
import type { EmbeddedImage } from './image.js';

const PT_PER_MM = 72 / 25.4;

const f = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const rgb = (color: string): [number, number, number] => {
  const parsed = parseColor(color) ?? { r: 0, g: 0, b: 0 };
  return [parsed.r / 255, parsed.g / 255, parsed.b / 255];
};

const psString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export type EpsOptions = {
  sideMm?: number;
  title?: string;
  /**
   * Decoded logo samples, keyed by href. These must already be flattened onto
   * an opaque ground — see `groundUnderLogo`. PostScript's masked-image types
   * are supported unevenly enough across RIPs that a flattened logo is the only
   * version that reliably prints, which is what every design tool does when it
   * writes EPS too.
   */
  images?: Map<string, EmbeddedImage>;
};

/**
 * Write the scene as Encapsulated PostScript.
 *
 * Level 3 is declared because gradients use `shfill`, which Level 2 lacks. The
 * competitor that charges for EPS ships black and white only; there is no reason
 * for that restriction, so this carries full colour.
 */
export const sceneToEps = (scene: Scene, options: EpsOptions = {}): string => {
  const { sideMm = 40, title = 'QR Code' } = options;
  const scale = (sideMm * PT_PER_MM) / scene.width;
  const pageW = scene.width * scale;
  const pageH = scene.height * scale;

  const out: string[] = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%Title: ${psString(title)}`,
    '%%Creator: QR Studio',
    `%%BoundingBox: 0 0 ${Math.ceil(pageW)} ${Math.ceil(pageH)}`,
    `%%HiResBoundingBox: 0 0 ${f(pageW)} ${f(pageH)}`,
    '%%LanguageLevel: 3',
    '%%EndComments',
    '%%BeginProlog',
    '/qrsave save def',
    '%%EndProlog',
    'gsave',
    // PostScript shares PDF's bottom-left origin, so the scene is flipped once.
    `1 0 0 -1 0 ${f(pageH)} concat`,
  ];

  const emitPath = (d: string, dx: number, dy: number) => {
    for (const sub of parsePathData(d)) {
      out.push(`${f((sub.start.x + dx) * scale)} ${f((sub.start.y + dy) * scale)} moveto`);
      for (const seg of sub.segments) {
        if (seg.kind === 'line') {
          out.push(`${f((seg.x + dx) * scale)} ${f((seg.y + dy) * scale)} lineto`);
        } else {
          out.push(
            `${f((seg.x1 + dx) * scale)} ${f((seg.y1 + dy) * scale)} ` +
              `${f((seg.x2 + dx) * scale)} ${f((seg.y2 + dy) * scale)} ` +
              `${f((seg.x + dx) * scale)} ${f((seg.y + dy) * scale)} curveto`,
          );
        }
      }
      out.push('closepath');
    }
  };

  const shading = (fill: Fill, x0: number, y0: number, x1: number, y1: number) => {
    if (fill.kind === 'solid') return;
    const stops = [...fill.stops].sort((a, b) => a.offset - b.offset);
    const first = stops[0] ?? { offset: 0, color: '#000000' };
    const last = stops[stops.length - 1] ?? first;
    const [r0, g0, b0] = rgb(first.color);
    const [r1, g1, b1] = rgb(last.color);

    // A two-colour exponential function. Multi-stop gradients are approximated
    // by their endpoints here: PostScript stitching functions are supported
    // unevenly by RIPs, and a wrong gradient prints worse than a simple one.
    const fn =
      `<< /FunctionType 2 /Domain [0 1] ` +
      `/C0 [${f(r0)} ${f(g0)} ${f(b0)}] /C1 [${f(r1)} ${f(g1)} ${f(b1)}] /N 1 >>`;

    if (fill.kind === 'linear') {
      out.push(
        `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${f(x0)} ${f(y0)} ${f(x1)} ${f(y1)}] ` +
          `/Function ${fn} /Extend [true true] >> shfill`,
      );
    } else {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const radius = Math.hypot(x1 - x0, y1 - y0) / 2;
      out.push(
        `<< /ShadingType 3 /ColorSpace /DeviceRGB ` +
          `/Coords [${f(cx)} ${f(cy)} 0 ${f(cx)} ${f(cy)} ${f(radius * 1.4)}] ` +
          `/Function ${fn} /Extend [true true] >> shfill`,
      );
    }
  };

  const paint = (fill: Fill, draw: () => void, evenOdd: boolean) => {
    if (fill.kind === 'solid') {
      const [r, g, b] = rgb(fill.color);
      out.push(`${f(r)} ${f(g)} ${f(b)} setrgbcolor`);
      draw();
      out.push(evenOdd ? 'eofill' : 'fill');
      return;
    }
    const angle = fill.kind === 'linear' ? ((fill.angle % 360) * Math.PI) / 180 : 0;
    const cx = pageW / 2;
    const cy = pageH / 2;
    const half = Math.max(pageW, pageH) / 2;
    out.push('gsave');
    draw();
    out.push(evenOdd ? 'eoclip' : 'clip');
    shading(
      fill,
      cx - Math.cos(angle) * half,
      cy - Math.sin(angle) * half,
      cx + Math.cos(angle) * half,
      cy + Math.sin(angle) * half,
    );
    out.push('grestore');
  };

  for (const item of scene.items) {
    switch (item.kind) {
      case 'rect':
        paint(
          item.fill,
          () =>
            out.push(
              `${f(item.x * scale)} ${f(item.y * scale)} moveto`,
              `${f(item.w * scale)} 0 rlineto`,
              `0 ${f(item.h * scale)} rlineto`,
              `${f(-item.w * scale)} 0 rlineto`,
              'closepath',
            ),
          false,
        );
        break;
      case 'path': {
        const dx = item.inCode ? scene.codeOffset.x : 0;
        const dy = item.inCode ? scene.codeOffset.y : 0;
        paint(item.fill, () => emitPath(item.d, dx, dy), item.evenOdd);
        break;
      }
      case 'text': {
        const [r, g, b] = rgb(item.color);
        const size = item.size * scale;
        out.push(
          'gsave',
          `1 0 0 -1 0 ${f(item.y * scale * 2)} concat`,
          `/Helvetica-Bold findfont ${f(size)} scalefont setfont`,
          `${f(r)} ${f(g)} ${f(b)} setrgbcolor`,
          // PostScript can measure the string itself, so centring is exact here.
          `(${psString(item.text)}) dup stringwidth pop 2 div ${f(item.x * scale)} exch sub ${f(item.y * scale + size * 0.35)} moveto show`,
        );
        out.push('grestore');
        break;
      }
      case 'image': {
        const embedded = options.images?.get(item.href);
        if (!embedded) break;

        const filters = embedded.deflated
          ? '/ASCII85Decode filter /FlateDecode filter'
          : '/ASCII85Decode filter';

        out.push(
          'gsave',
          `${f(item.x * scale)} ${f(item.y * scale)} translate`,
          `${f(item.w * scale)} ${f(item.h * scale)} scale`,
          '/DeviceRGB setcolorspace',
          `<< /ImageType 1 /Width ${embedded.width} /Height ${embedded.height} ` +
            '/BitsPerComponent 8 /Decode [0 1 0 1 0 1] ' +
            // Maps the unit square straight onto the sample grid, so row zero
            // lands at the top of the box in this already-flipped space.
            `/ImageMatrix [${embedded.width} 0 0 ${embedded.height} 0 0] ` +
            `/DataSource currentfile ${filters} >> image`,
          // Indented so no line of sample data can begin with `%` and be
          // mistaken for a DSC comment. ASCII85Decode skips whitespace.
          embedded.rgb
            .split('\n')
            .map((line) => ` ${line}`)
            .join('\n'),
          'grestore',
        );
        break;
      }
      default:
        break;
    }
  }

  out.push('grestore', 'qrsave restore', '%%EOF', '');
  return out.join('\n');
};
