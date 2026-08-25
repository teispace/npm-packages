/**
 * Render a {@link Scene} as React elements.
 *
 * The alternative — generating the SVG string and injecting it with
 * `dangerouslySetInnerHTML` — is what most React QR wrappers do. It works, but
 * it opts out of reconciliation entirely (React replaces the whole subtree on
 * every change), it cannot accept a ref or an event handler on any part of the
 * code, and it puts a string interpolated from user input into the DOM.
 *
 * Building real elements costs a few dozen lines and avoids all three.
 */

import type { ReactElement } from 'react';
import { resolvePaint } from '../render/gradient.js';
import type { Scene, SceneItem } from '../render/scene.js';
import type { Fill } from '../render/types.js';

/** Trim float noise, matching the string renderer so both produce identical geometry. */
const n = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

interface Defs {
  readonly elements: ReactElement[];
  paint(key: string, fill: Fill): string;
}

/**
 * Collect gradient definitions as they are referenced.
 *
 * Ids come from a hash of the fill, so they are stable across renders: two
 * codes on one page share a definition rather than colliding, and server and
 * client markup agree, which is what keeps hydration quiet.
 */
const createDefs = (): Defs => {
  const seen = new Map<string, ReactElement>();
  const elements: ReactElement[] = [];

  return {
    elements,
    paint(key, fill) {
      const resolved = resolvePaint(fill, key);
      if (!resolved.def) return resolved.ref;

      const id = /id="([^"]+)"/.exec(resolved.def)?.[1] ?? key;
      if (!seen.has(id)) {
        const element = gradientElement(id, fill);
        seen.set(id, element);
        elements.push(element);
      }
      return resolved.ref;
    },
  };
};

const gradientElement = (id: string, fill: Fill): ReactElement => {
  if (fill.kind === 'solid') throw new Error('Solid fills need no gradient definition');

  const stops = fill.stops.map((stop, index) => (
    <stop
      // Offsets can legitimately repeat in a gradient, so the index is the
      // only stable key here.
      key={`${stop.offset}-${index}`}
      offset={n(Math.max(0, Math.min(1, stop.offset)))}
      stopColor={stop.color}
    />
  ));

  if (fill.kind === 'linear') {
    // Unit-square coordinates, so the gradient follows the code's own box
    // rather than the viewport.
    const radians = ((fill.angle % 360) * Math.PI) / 180;
    const dx = Math.cos(radians) / 2;
    const dy = Math.sin(radians) / 2;
    return (
      <linearGradient
        key={id}
        id={id}
        x1={n(0.5 - dx)}
        y1={n(0.5 - dy)}
        x2={n(0.5 + dx)}
        y2={n(0.5 + dy)}
      >
        {stops}
      </linearGradient>
    );
  }

  return (
    <radialGradient key={id} id={id} cx="0.5" cy="0.5" r="0.7">
      {stops}
    </radialGradient>
  );
};

const itemElement = (item: SceneItem, index: number, defs: Defs): ReactElement | null => {
  switch (item.kind) {
    case 'rect':
      return (
        <rect
          key={index}
          x={n(item.x)}
          y={n(item.y)}
          width={n(item.w)}
          height={n(item.h)}
          fill={defs.paint(item.paintKey, item.fill)}
        />
      );
    case 'path':
      return (
        <path
          key={index}
          d={item.d}
          fill={defs.paint(item.paintKey, item.fill)}
          {...(item.evenOdd ? { fillRule: 'evenodd' as const } : {})}
        />
      );
    case 'image':
      return (
        <image
          key={index}
          href={item.href}
          x={n(item.x)}
          y={n(item.y)}
          width={n(item.w)}
          height={n(item.h)}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    case 'text':
      return (
        <text
          key={index}
          x={n(item.x)}
          y={n(item.y)}
          fill={item.color}
          fontFamily={item.family}
          fontSize={n(item.size)}
          fontWeight={700}
          letterSpacing={0.12}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {item.text}
        </text>
      );
    default:
      return null;
  }
};

export interface SceneElements {
  readonly defs: ReactElement[];
  /** Items drawn before the code layer — the frame and background. */
  readonly before: ReactElement[];
  /** Items in code coordinates, needing the quiet-zone translation. */
  readonly inCode: ReactElement[];
  /** Items drawn after the code layer — logo plate, logo and label. */
  readonly after: ReactElement[];
  readonly viewBox: string;
}

/** Split a scene into the three layers the SVG document needs, in draw order. */
export const sceneToElements = (scene: Scene): SceneElements => {
  const defs = createDefs();
  const before: ReactElement[] = [];
  const inCode: ReactElement[] = [];
  const after: ReactElement[] = [];

  // The code layer sits where the first in-code item falls in document order:
  // after the background, before the logo plate and label.
  const firstInCode = scene.items.findIndex((item) => item.kind === 'path' && item.inCode);

  scene.items.forEach((item, index) => {
    const element = itemElement(item, index, defs);
    if (!element) return;
    if (item.kind === 'path' && item.inCode) inCode.push(element);
    else if (firstInCode === -1 || index < firstInCode) before.push(element);
    else after.push(element);
  });

  return {
    defs: defs.elements,
    before,
    inCode,
    after,
    viewBox: `0 0 ${n(scene.width)} ${n(scene.height)}`,
  };
};

export { n as formatNumber };
