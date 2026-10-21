import { describe, expect, it } from 'vitest';
import { rangeAnchor } from '../../src/react/selection-anchor.js';

/** jsdom lays nothing out: give each element a box of its own. */
function boxed(tag: string, top: number): HTMLElement {
  const element = document.createElement(tag);
  element.getBoundingClientRect = () => new DOMRect(0, top, 100, 20);
  return element;
}

describe('rangeAnchor', () => {
  const root = boxed('div', 0);
  root.getBoundingClientRect = () => new DOMRect(0, 0, 100, 400);
  const first = boxed('p', 10);
  const last = boxed('p', 40);
  first.append('One');
  root.append(first, last);
  const at = (node: Node, offset: number) => {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    // A collapsed range has no box of its own, as in a browser.
    range.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
    return rangeAnchor(range, root).getBoundingClientRect();
  };

  it('a caret at the end of the document: the last block, not the document', () => {
    expect(at(root, 2).top).toBe(40);
  });

  it('a caret between blocks: the block after it', () => {
    expect(at(root, 0).top).toBe(10);
    expect(at(root, 1).top).toBe(40);
  });

  it('a caret in an empty line: its line', () => {
    expect(at(last, 0).top).toBe(40);
  });

  it('a caret in text with no box of its own: its line', () => {
    expect(at(first.firstChild as Node, 1).top).toBe(10);
  });
});
