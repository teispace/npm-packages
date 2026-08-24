import type { QrMatrix } from '../core/types.js';
import { escapeAttr, resolvePaint } from './gradient.js';
import { buildScene, type Scene } from './scene.js';
import { n } from './shapes.js';
import type { QrStyle } from './types.js';

export type RenderResult = {
  svg: string;
  /** Width in modules including the quiet zone. */
  span: number;
  /** Height in modules — larger than `span` when a label frame is present. */
  spanY: number;
  widthPx: number;
  heightPx: number;
};

/** Serialise a scene as SVG. */
export const sceneToSvg = (scene: Scene): RenderResult => {
  const { width, height, codeOffset, items, style } = scene;

  // Paints are resolved per fill, keyed so body, eye frame and eye ball each
  // get their own gradient definition rather than colliding on one id.
  const defs: string[] = [];
  const paintFor = (key: string, fill: Parameters<typeof resolvePaint>[0]) => {
    const paint = resolvePaint(fill, key);
    if (paint.def && !defs.includes(paint.def)) defs.push(paint.def);
    return paint.ref;
  };

  const outer: string[] = [];
  const inCode: string[] = [];

  for (const item of items) {
    switch (item.kind) {
      case 'rect': {
        const ref = paintFor(item.paintKey, item.fill);
        outer.push(
          `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" fill="${ref}"/>`,
        );
        break;
      }
      case 'path': {
        const ref = paintFor(item.paintKey, item.fill);
        const markup = `<path d="${item.d}" fill="${ref}"${item.evenOdd ? ' fill-rule="evenodd"' : ''}/>`;
        (item.inCode ? inCode : outer).push(markup);
        break;
      }
      case 'image':
        outer.push(
          `<image href="${escapeAttr(item.href)}" x="${n(item.x)}" y="${n(item.y)}" ` +
            `width="${n(item.w)}" height="${n(item.h)}" preserveAspectRatio="xMidYMid meet"/>`,
        );
        break;
      case 'text':
        outer.push(
          `<text x="${n(item.x)}" y="${n(item.y)}" fill="${escapeAttr(item.color)}" ` +
            `font-family="${escapeAttr(item.family)}" font-size="${n(item.size)}" ` +
            'font-weight="700" letter-spacing="0.12" text-anchor="middle" ' +
            `dominant-baseline="central">${escapeAttr(item.text)}</text>`,
        );
        break;
      default:
        break;
    }
  }

  // The code layer is emitted where it falls in document order: after the
  // background, before the logo plate and label.
  const backgroundCount = items.findIndex((i) => i.kind === 'path' && i.inCode);
  const before = outer.slice(0, Math.max(0, backgroundCount));
  const after = outer.slice(Math.max(0, backgroundCount));

  const layers = [
    ...before,
    `<g transform="translate(${n(codeOffset.x)},${n(codeOffset.y)})">${inCode.join('')}</g>`,
    ...after,
  ];

  const widthPx = Math.round(width * style.moduleSize);
  const heightPx = Math.round(height * style.moduleSize);

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    (style.logo ? 'xmlns:xlink="http://www.w3.org/1999/xlink" ' : '') +
    `width="${widthPx}" height="${heightPx}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" shape-rendering="geometricPrecision">` +
    (defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '') +
    layers.join('') +
    '</svg>';

  return { svg, span: width, spanY: height, widthPx, heightPx };
};

export const renderSvg = (matrix: QrMatrix, style: Partial<QrStyle> = {}): RenderResult =>
  sceneToSvg(buildScene(matrix, style));
