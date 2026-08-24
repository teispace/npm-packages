/**
 * Convert the SVG path subset the renderer emits into line and cubic segments.
 *
 * PDF and PostScript have no arc-to primitive that matches SVG's, so arcs are
 * converted to cubic Béziers rather than flattened to polygons. A dotted QR code
 * has hundreds of circles; as polygons that is tens of thousands of points and a
 * bloated file, whereas four cubics per circle stays exact and small.
 */

export type Segment =
  | { kind: 'line'; x: number; y: number }
  | { kind: 'cubic'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

export type SubPath = {
  start: { x: number; y: number };
  segments: Segment[];
};

type Point = { x: number; y: number };

/**
 * Approximate one elliptical arc sweep with cubic Béziers, splitting at 90° so
 * no single cubic has to bend more than a quarter turn — past that the error
 * becomes visible.
 */
const arcToCubics = (
  from: Point,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): Segment[] => {
  if (rx === 0 || ry === 0) return [{ kind: 'line', x: to.x, y: to.y }];

  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (from.x - to.x) / 2;
  const dy2 = (from.y - to.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxa = Math.abs(rx);
  let rya = Math.abs(ry);
  // Scale radii up when they are too small to span the endpoints (F.6.6).
  const lambda = (x1p * x1p) / (rxa * rxa) + (y1p * y1p) / (rya * rya);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rxa *= scale;
    rya *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rxa * rxa * rya * rya - rxa * rxa * y1p * y1p - rya * rya * x1p * x1p;
  const denominator = rxa * rxa * y1p * y1p + rya * rya * x1p * x1p;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));

  const cxp = (coefficient * (rxa * y1p)) / rya;
  const cyp = coefficient * -((rya * x1p) / rxa);
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    const value = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    return ux * vy - uy * vx < 0 ? -value : value;
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rxa, (y1p - cyp) / rya);
  let delta = angle((x1p - cxp) / rxa, (y1p - cyp) / rya, (-x1p - cxp) / rxa, (-y1p - cyp) / rya);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / count;
  // Magic constant for a cubic approximation of a circular arc of angle `step`.
  const alpha = (4 / 3) * Math.tan(step / 4);

  const point = (t: number): Point => ({
    x: cosPhi * rxa * Math.cos(t) - sinPhi * rya * Math.sin(t) + cx,
    y: sinPhi * rxa * Math.cos(t) + cosPhi * rya * Math.sin(t) + cy,
  });
  const derivative = (t: number): Point => ({
    x: -cosPhi * rxa * Math.sin(t) - sinPhi * rya * Math.cos(t),
    y: -sinPhi * rxa * Math.sin(t) + cosPhi * rya * Math.cos(t),
  });

  const out: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = theta1 + step * i;
    const t1 = t0 + step;
    const p0 = point(t0);
    const p1 = point(t1);
    const d0 = derivative(t0);
    const d1 = derivative(t1);
    out.push({
      kind: 'cubic',
      x1: p0.x + alpha * d0.x,
      y1: p0.y + alpha * d0.y,
      x2: p1.x - alpha * d1.x,
      y2: p1.y - alpha * d1.y,
      x: p1.x,
      y: p1.y,
    });
  }

  return out;
};

const TOKEN = /([MmLlHhVvAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

export const parsePathData = (d: string): SubPath[] => {
  const tokens: (string | number)[] = [];
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = TOKEN.exec(d)) !== null) {
    tokens.push(match[1] ?? Number.parseFloat(match[2]));
  }

  const subPaths: SubPath[] = [];
  let current: SubPath | null = null;
  let cursor: Point = { x: 0, y: 0 };
  let command = '';
  let i = 0;

  const num = (): number => tokens[i++] as number;
  const push = (segment: Segment) => current?.segments.push(segment);

  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') {
      command = tokens[i] as string;
      i++;
      if (command === 'Z' || command === 'z') {
        current = null;
        continue;
      }
      if (command === 'M' || command === 'm') {
        const x = num();
        const y = num();
        cursor = command === 'M' ? { x, y } : { x: cursor.x + x, y: cursor.y + y };
        current = { start: { ...cursor }, segments: [] };
        subPaths.push(current);
        continue;
      }
    }

    switch (command) {
      case 'L':
      case 'l': {
        const x = num();
        const y = num();
        cursor = command === 'L' ? { x, y } : { x: cursor.x + x, y: cursor.y + y };
        push({ kind: 'line', x: cursor.x, y: cursor.y });
        break;
      }
      case 'H':
      case 'h': {
        const x = num();
        cursor = { x: command === 'H' ? x : cursor.x + x, y: cursor.y };
        push({ kind: 'line', x: cursor.x, y: cursor.y });
        break;
      }
      case 'V':
      case 'v': {
        const y = num();
        cursor = { x: cursor.x, y: command === 'V' ? y : cursor.y + y };
        push({ kind: 'line', x: cursor.x, y: cursor.y });
        break;
      }
      case 'A':
      case 'a': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const ex = num();
        const ey = num();
        const end = command === 'A' ? { x: ex, y: ey } : { x: cursor.x + ex, y: cursor.y + ey };
        for (const segment of arcToCubics(cursor, rx, ry, rot, large, sweep, end)) push(segment);
        cursor = end;
        break;
      }
      default:
        i++;
        break;
    }
  }

  return subPaths.filter((p) => p.segments.length > 0);
};
