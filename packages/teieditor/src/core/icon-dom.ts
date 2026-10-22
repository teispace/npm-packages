import type { TeiIconNode } from './types.js';

const SVG = 'http://www.w3.org/2000/svg';

/** The React `<Icon>`'s attributes, the same here. */
const ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
  ['viewBox', '0 0 24 24'],
  ['fill', 'none'],
  ['stroke', 'currentColor'],
  ['stroke-width', '2'],
  ['stroke-linecap', 'round'],
  ['stroke-linejoin', 'round'],
  ['aria-hidden', 'true'],
  ['focusable', 'false'],
];

/**
 * An icon as an `<svg>` element, drawn as the React `<Icon>` draws it: for
 * nodes that make their own DOM (a callout's marker), which the server
 * renders too.
 */
export function iconElement(doc: Document, node: TeiIconNode): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  for (const [name, value] of ATTRIBUTES) svg.setAttribute(name, value);
  for (const [tag, attrs] of node) {
    const child = doc.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) child.setAttribute(name, value);
    svg.append(child);
  }
  return svg;
}
