// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Card } from '../../src/extensions/card/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { StickyNote } from '../../src/extensions/sticky-note/index.js';
import { renderToHTML, toMarkdown } from '../../src/server/index.js';

const options = { extensions: [StarterKit, Card, StickyNote] };

describe('cards and sticky notes on the server', () => {
  it('read and write their HTML with no DOM globals', () => {
    const html =
      '<div data-tei-card="outlined" data-tei-card-accent="green"><p>Card</p>' +
      '<aside data-tei-sticky="blue" role="note"><p>Note</p><ul><li>a</li></ul></aside></div>';
    expect(renderToHTML(html, options)).toBe(html);
    expect(toMarkdown(html, options)).toBe(
      '<!-- card outlined green -->\n\nCard\n\n<!-- sticky blue -->\n\nNote\n\n- a\n\n<!-- /sticky -->\n\n<!-- /card -->',
    );
  });
});
