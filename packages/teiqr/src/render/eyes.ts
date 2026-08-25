import { circlePath, roundedRect, superellipsePath } from './shapes.js';
import type { EyeBallShape, EyeFrameShape } from './types.js';

/** Top-left origin of each finder pattern, in module coordinates. */
export const eyeOrigins = (size: number): [number, number][] => [
  [0, 0],
  [size - 7, 0],
  [0, size - 7],
];

/**
 * The finder frame is a 7x7 ring one module thick. It is drawn as an outer
 * shape plus an inner counter-shape; `fill-rule="evenodd"` punches the hole, so
 * the ring stays exactly one module wide whatever the corner treatment.
 */
export const eyeFramePath = (ox: number, oy: number, shape: EyeFrameShape): string => {
  const outer = (r: number) => roundedRect(ox, oy, 7, 7, r, r, r, r);
  const inner = (r: number) => roundedRect(ox + 1, oy + 1, 5, 5, r, r, r, r);

  switch (shape) {
    case 'square':
      return outer(0) + inner(0);
    case 'rounded':
      // 1.7 is the limit past which a corner radius stops covering the centre
      // of the ring's corner module. Beyond it the finder pattern is genuinely
      // damaged, not merely restyled.
      return outer(1.5) + inner(1);
    case 'circle':
      return circlePath(ox + 3.5, oy + 3.5, 3.5) + circlePath(ox + 3.5, oy + 3.5, 2.5);
    case 'leaf':
      // Two opposite corners fully rounded, the other two square.
      return (
        roundedRect(ox, oy, 7, 7, 2.4, 0, 2.4, 0) +
        roundedRect(ox + 1, oy + 1, 5, 5, 1.7, 0, 1.7, 0)
      );
    case 'cut':
      // One corner squared off, the rest rounded.
      return (
        roundedRect(ox, oy, 7, 7, 0, 1.5, 1.5, 1.5) + roundedRect(ox + 1, oy + 1, 5, 5, 0, 1, 1, 1)
      );
    case 'dotted': {
      // Every module of the ring drawn as its own dot.
      const parts: string[] = [];
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const onRing = dx === 0 || dy === 0 || dx === 6 || dy === 6;
          if (onRing) parts.push(circlePath(ox + dx + 0.5, oy + dy + 0.5, 0.5));
        }
      }
      return parts.join('');
    }
    default:
      return outer(0) + inner(0);
  }
};

/** The 3x3 core sitting inside the frame. */
export const eyeBallPath = (ox: number, oy: number, shape: EyeBallShape): string => {
  const x = ox + 2;
  const y = oy + 2;

  switch (shape) {
    case 'square':
      return roundedRect(x, y, 3, 3, 0, 0, 0, 0);
    case 'dot':
      return circlePath(x + 1.5, y + 1.5, 1.5);
    case 'rounded':
      return roundedRect(x, y, 3, 3, 0.9, 0.9, 0.9, 0.9);
    case 'leaf':
      return roundedRect(x, y, 3, 3, 1.5, 0, 1.5, 0);
    case 'diamond':
      return superellipsePath(x + 1.5, y + 1.5, 1.5, 1.45);
    default:
      return roundedRect(x, y, 3, 3, 0, 0, 0, 0);
  }
};
