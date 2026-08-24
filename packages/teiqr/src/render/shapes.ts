import type { ModuleShape } from './types.js';

/** Trim float noise out of path data — shorter strings, identical rendering. */
export const n = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** A rectangle with independently sized corners. Radii of 0 stay square. */
export const roundedRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): string => {
  const max = Math.min(w, h) / 2;
  const a = Math.min(tl, max);
  const b = Math.min(tr, max);
  const c = Math.min(br, max);
  const d = Math.min(bl, max);

  return [
    `M${n(x + a)},${n(y)}`,
    `H${n(x + w - b)}`,
    b > 0 ? `A${n(b)},${n(b)} 0 0 1 ${n(x + w)},${n(y + b)}` : '',
    `V${n(y + h - c)}`,
    c > 0 ? `A${n(c)},${n(c)} 0 0 1 ${n(x + w - c)},${n(y + h)}` : '',
    `H${n(x + d)}`,
    d > 0 ? `A${n(d)},${n(d)} 0 0 1 ${n(x)},${n(y + h - d)}` : '',
    `V${n(y + a)}`,
    a > 0 ? `A${n(a)},${n(a)} 0 0 1 ${n(x + a)},${n(y)}` : '',
    'Z',
  ].join('');
};

/**
 * Superellipse |x/r|^p + |y/r|^p = 1, sampled as a polygon. p = 1 is a diamond,
 * p = 2 a circle. Values in between keep a diamond silhouette while covering far
 * more of the module — a true inscribed diamond holds only half the area, which
 * is not enough for a finder core to stay reliably detectable.
 */
export const superellipsePath = (
  cx: number,
  cy: number,
  r: number,
  power: number,
  samples = 48,
): string => {
  const points: string[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = cx + r * Math.sign(ct) * Math.abs(ct) ** (2 / power);
    const y = cy + r * Math.sign(st) * Math.abs(st) ** (2 / power);
    points.push(`${n(x)},${n(y)}`);
  }
  return `M${points.join('L')}Z`;
};

export const circlePath = (cx: number, cy: number, r: number): string =>
  `M${n(cx - r)},${n(cy)}a${n(r)},${n(r)} 0 1 0 ${n(r * 2)},0a${n(r)},${n(r)} 0 1 0 ${n(-r * 2)},0Z`;

const diamondPath = (x: number, y: number, s: number): string => {
  const h = s / 2;
  return `M${n(x + h)},${n(y)}L${n(x + s)},${n(y + h)}L${n(x + h)},${n(y + s)}L${n(x)},${n(y + h)}Z`;
};

const starPath = (x: number, y: number, s: number): string => {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const outer = s / 2;
  // Deliberately fat for a star. At the classic 0.4 ratio the points are pretty
  // and the module loses more than half its area, which measurably costs
  // detection margin. This keeps the silhouette and most of the coverage.
  const inner = outer * 0.72;
  const points: string[] = [];
  // Eight alternating vertices, starting at the top.
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    points.push(`${n(cx + r * Math.cos(angle))},${n(cy + r * Math.sin(angle))}`);
  }
  return `M${points.join('L')}Z`;
};

export type NeighbourTest = (x: number, y: number) => boolean;

/**
 * Path data for one module. `isDark` lets a shape consult its neighbours, which
 * is what makes the connected shapes look continuous rather than tiled.
 */
const modulePath = (
  shape: ModuleShape,
  x: number,
  y: number,
  inset: number,
  isDark: NeighbourTest,
): string => {
  const p = x + inset;
  const q = y + inset;
  const s = 1 - inset * 2;

  switch (shape) {
    case 'square':
      return roundedRect(p, q, s, s, 0, 0, 0, 0);
    case 'dot':
      return circlePath(p + s / 2, q + s / 2, s / 2);
    case 'rounded':
      return roundedRect(p, q, s, s, s * 0.25, s * 0.25, s * 0.25, s * 0.25);
    case 'extra-rounded':
      return roundedRect(p, q, s, s, s * 0.45, s * 0.45, s * 0.45, s * 0.45);
    case 'classy': {
      // Two opposite corners rounded — the signature asymmetric look.
      const r = s * 0.5;
      return roundedRect(p, q, s, s, r, 0, r, 0);
    }
    case 'diamond':
      return diamondPath(p, q, s);
    case 'star':
      return starPath(p, q, s);
    case 'fluid': {
      // Round only the corners that face open space, so runs of dark modules
      // fuse into one continuous form.
      const up = isDark(x, y - 1);
      const down = isDark(x, y + 1);
      const left = isDark(x - 1, y);
      const right = isDark(x + 1, y);
      const r = 0.5;
      return roundedRect(
        x,
        y,
        1,
        1,
        !(up || left) ? r : 0,
        !(up || right) ? r : 0,
        !(down || right) ? r : 0,
        !(down || left) ? r : 0,
      );
    }
    default:
      return roundedRect(p, q, s, s, 0, 0, 0, 0);
  }
};

/**
 * Merge consecutive dark modules along one axis into a single rounded bar.
 * Drawing them individually would leave seams at every module boundary.
 */
const barsPath = (
  size: number,
  isDark: NeighbourTest,
  axis: 'vertical' | 'horizontal',
  inset: number,
  rows = size,
): string => {
  const parts: string[] = [];
  const thickness = 1 - inset * 2;
  const radius = thickness / 2;

  // A vertical bar runs down a column, so its major axis is the column index
  // and its minor axis the row index; horizontal bars are the transpose.
  const majorCount = axis === 'vertical' ? size : rows;
  const minorCount = axis === 'vertical' ? rows : size;

  for (let major = 0; major < majorCount; major++) {
    let runStart = -1;
    for (let minor = 0; minor <= minorCount; minor++) {
      const dark =
        minor < minorCount && (axis === 'vertical' ? isDark(major, minor) : isDark(minor, major));

      if (dark && runStart === -1) runStart = minor;
      if (!dark && runStart !== -1) {
        const length = minor - runStart;
        parts.push(
          axis === 'vertical'
            ? roundedRect(
                major + inset,
                runStart + inset,
                thickness,
                length - inset * 2,
                radius,
                radius,
                radius,
                radius,
              )
            : roundedRect(
                runStart + inset,
                major + inset,
                length - inset * 2,
                thickness,
                radius,
                radius,
                radius,
                radius,
              ),
        );
        runStart = -1;
      }
    }
  }

  return parts.join('');
};

/** Path data covering every module the predicate marks dark. */
export const bodyPath = (
  size: number,
  shape: ModuleShape,
  isDark: NeighbourTest,
  gap = 0,
  /** Row count, when the grid is not square. Defaults to `size`. */
  rows = size,
): string => {
  const inset = Math.max(0, Math.min(0.4, gap)) / 2;

  if (shape === 'vertical' || shape === 'horizontal') {
    return barsPath(size, isDark, shape, inset, rows);
  }

  // Connected shapes must touch, so they ignore the gap.
  const effectiveInset = shape === 'fluid' ? 0 : inset;
  const parts: string[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < size; x++) {
      if (isDark(x, y)) parts.push(modulePath(shape, x, y, effectiveInset, isDark));
    }
  }
  return parts.join('');
};
