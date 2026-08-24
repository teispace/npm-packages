import { MODULE, type QrMatrix } from '../core/types.js';
import { eyeBallPath, eyeFramePath, eyeOrigins } from './eyes.js';
import { logoGeometry } from './logo.js';
import { bodyPath, roundedRect } from './shapes.js';
import { DEFAULT_STYLE, type Fill, type QrStyle } from './types.js';

/**
 * A device-independent description of the rendered code.
 *
 * SVG, PDF and EPS all serialise from this, so the geometry is generated once
 * and cannot drift between formats. Everything is in module units with the
 * origin at the top left; each writer applies its own coordinate convention.
 */
export type SceneItem =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: Fill; paintKey: string }
  | {
      kind: 'path';
      d: string;
      fill: Fill;
      evenOdd: boolean;
      /** Path data is in matrix coordinates and needs the code offset applied. */
      inCode: boolean;
      /**
       * Names this fill's role. Gradient ids derive from it, so they stay tied
       * to what they paint rather than to scene order.
       */
      paintKey: string;
    }
  | { kind: 'image'; href: string; x: number; y: number; w: number; h: number }
  | {
      kind: 'text';
      x: number;
      y: number;
      size: number;
      text: string;
      color: string;
      family: string;
    };

export type Scene = {
  /** Width in modules, quiet zone included. */
  width: number;
  /** Height in modules — taller than `width` when a label band is present. */
  height: number;
  /** Translation applied to items flagged `inCode`. */
  codeOffset: { x: number; y: number };
  items: SceneItem[];
  style: QrStyle;
};

/** Label band height in modules, when a frame carries text. */
export const LABEL_HEIGHT = 6;

const isBodyModule = (matrix: QrMatrix, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) return false;
  const i = y * matrix.size + x;
  if (matrix.modules[i] !== 1) return false;
  const kind = matrix.kinds[i];
  return kind !== MODULE.FINDER && kind !== MODULE.SEPARATOR;
};

const solid = (color: string): Fill => ({ kind: 'solid', color });

export const buildScene = (matrix: QrMatrix, style: Partial<QrStyle> = {}): Scene => {
  const s: QrStyle = { ...DEFAULT_STYLE, ...style };
  const quiet = Math.max(0, s.quietZone);
  const width = matrix.size + quiet * 2;

  const frame = s.frame && s.frame.style !== 'none' ? s.frame : null;
  const hasLabel = Boolean(frame && frame.style !== 'box' && frame.text.trim());
  const labelBand = hasLabel ? LABEL_HEIGHT : 0;
  const height = width + labelBand;
  const labelOnTop = frame?.style === 'label-top';
  const codeOffsetY = labelOnTop ? labelBand : 0;

  const items: SceneItem[] = [];

  if (frame) {
    const r = frame.cornerRadius;
    items.push({
      kind: 'path',
      d: roundedRect(0, 0, width, height, r, r, r, r),
      fill: solid(frame.background),
      evenOdd: false,
      inCode: false,
      paintKey: 'fr',
    });
  }

  if (s.background) {
    const inset = frame ? frame.border : 0;
    const side = width - inset * 2;
    const bx = inset;
    const by = codeOffsetY + inset;
    items.push(
      s.cornerRadius > 0
        ? {
            kind: 'path',
            d: roundedRect(
              bx,
              by,
              side,
              side,
              s.cornerRadius,
              s.cornerRadius,
              s.cornerRadius,
              s.cornerRadius,
            ),
            fill: s.background,
            evenOdd: false,
            inCode: false,
            paintKey: 'g',
          }
        : { kind: 'rect', x: bx, y: by, w: side, h: side, fill: s.background, paintKey: 'g' },
    );
  }

  // Excavation happens before the body path is built, so cleared modules are
  // never drawn in the first place.
  const geometry = s.logo ? logoGeometry(matrix, s.logo) : null;
  const excavated = geometry && s.logo?.excavate ? geometry.covered : null;

  const body = bodyPath(
    matrix.size,
    s.moduleShape,
    (x, y) => {
      if (excavated?.has(y * matrix.size + x)) return false;
      return isBodyModule(matrix, x, y);
    },
    s.gap ?? 0,
  );
  if (body) {
    items.push({
      kind: 'path',
      d: body,
      fill: s.body,
      evenOdd: false,
      inCode: true,
      paintKey: 'b',
    });
  }

  const origins = eyeOrigins(matrix.size);
  const frames = origins.map(([ox, oy]) => eyeFramePath(ox, oy, s.eyeFrame)).join('');
  if (frames) {
    // evenodd is what turns each frame's outer and inner outline into a ring.
    items.push({
      kind: 'path',
      d: frames,
      fill: s.eyeFrameFill ?? s.body,
      evenOdd: true,
      inCode: true,
      paintKey: 'f',
    });
  }

  const balls = origins.map(([ox, oy]) => eyeBallPath(ox, oy, s.eyeBall)).join('');
  if (balls) {
    items.push({
      kind: 'path',
      d: balls,
      fill: s.eyeBallFill ?? s.body,
      evenOdd: false,
      inCode: true,
      paintKey: 'e',
    });
  }

  if (geometry && s.logo) {
    const logo = s.logo;
    const gx = quiet + geometry.clearX;
    const gy = quiet + codeOffsetY + geometry.clearY;
    const plateRadius =
      logo.shape === 'circle'
        ? geometry.clearSize / 2
        : logo.shape === 'rounded'
          ? geometry.clearSize * 0.18
          : 0;

    if (logo.background) {
      items.push({
        kind: 'path',
        d: roundedRect(
          gx,
          gy,
          geometry.clearSize,
          geometry.clearSize,
          plateRadius,
          plateRadius,
          plateRadius,
          plateRadius,
        ),
        fill: solid(logo.background),
        evenOdd: false,
        inCode: false,
        paintKey: 'lp',
      });
    }

    items.push({
      kind: 'image',
      href: logo.href,
      x: quiet + geometry.x,
      y: quiet + codeOffsetY + geometry.y,
      w: geometry.size,
      h: geometry.size,
    });
  }

  if (hasLabel && frame) {
    const bandY = labelOnTop ? 0 : width;
    items.push({
      kind: 'text',
      x: width / 2,
      y: bandY + LABEL_HEIGHT / 2,
      size: LABEL_HEIGHT * 0.5,
      text: frame.text,
      color: frame.textColor,
      family: frame.fontFamily,
    });
  }

  return { width, height, codeOffset: { x: quiet, y: quiet + codeOffsetY }, items, style: s };
};
