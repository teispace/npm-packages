import type { QrMatrix } from '../core/types.js';
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

/** Module dimensions, honouring rectangular symbologies like rMQR. */
export const matrixDimensions = (matrix: QrMatrix): { cols: number; rows: number } => ({
  cols: matrix.width ?? matrix.size,
  rows: matrix.height ?? matrix.size,
});

/**
 * Whether a module is painted by the body pass.
 *
 * Dark modules belong to the body unless a styled eye is going to paint them,
 * which is why this takes the eye origins rather than testing the module kind
 * alone. rMQR has finder patterns but no eyes — the shapes do not describe its
 * 5x5 sub-finder — so its finders have to be drawn here or they are not drawn
 * at all, which is a symbol that renders cleanly and cannot be scanned.
 */
const isBodyModule = (
  matrix: QrMatrix,
  eyes: readonly [number, number][],
  x: number,
  y: number,
): boolean => {
  const { cols, rows } = matrixDimensions(matrix);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
  const i = y * cols + x;
  if (matrix.modules[i] !== 1) return false;
  return !eyes.some(([ox, oy]) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7);
};

const solid = (color: string): Fill => ({ kind: 'solid', color });

export const buildScene = (matrix: QrMatrix, style: Partial<QrStyle> = {}): Scene => {
  const s: QrStyle = { ...DEFAULT_STYLE, ...style };
  const quiet = Math.max(0, s.quietZone);
  const { cols, rows } = matrixDimensions(matrix);
  const width = cols + quiet * 2;

  const frame = s.frame && s.frame.style !== 'none' ? s.frame : null;
  const hasLabel = Boolean(frame && frame.style !== 'box' && frame.text.trim());
  const labelBand = hasLabel ? LABEL_HEIGHT : 0;
  // Square symbols keep their existing behaviour exactly; only a rectangular
  // matrix produces a non-square code area.
  const codeHeight = rows + quiet * 2;
  const height = codeHeight + labelBand;
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
    const sideY = codeHeight - inset * 2;
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
              sideY,
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
        : { kind: 'rect', x: bx, y: by, w: side, h: sideY, fill: s.background, paintKey: 'g' },
    );
  }

  // Excavation happens before the body path is built, so cleared modules are
  // never drawn in the first place.
  const geometry = s.logo ? logoGeometry(matrix, s.logo) : null;
  const excavated = geometry && s.logo?.excavate ? geometry.covered : null;

  // Which modules the eye shapes will claim has to be known before the body
  // pass, so the two never paint the same module and never leave one unpainted.
  const origins = eyeOrigins(cols, matrix.variant ?? 'qr');

  const body = bodyPath(
    cols,
    s.moduleShape,
    (x, y) => {
      if (excavated?.has(y * cols + x)) return false;
      return isBodyModule(matrix, origins, x, y);
    },
    s.gap ?? 0,
    rows,
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
