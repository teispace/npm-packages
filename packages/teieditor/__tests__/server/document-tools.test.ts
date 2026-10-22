// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CharacterCount } from '../../src/extensions/character-count/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { TableOfContents } from '../../src/extensions/table-of-contents/index.js';
import { renderToHTML, toMarkdown } from '../../src/server/index.js';

const options = {
  extensions: [StarterKit, TableOfContents, CharacterCount.configure({ limit: 3 })],
};

describe('document tools on a server', () => {
  it('renders heading ids and a table of contents with no DOM', () => {
    const html =
      '<nav data-tei-toc></nav><h1>Intro</h1><h2>Intro</h2><p>Long text over the limit</p>';
    expect(renderToHTML(html, options)).toBe(
      '<nav data-tei-toc="" aria-label="Table of contents"><ol><li><a href="#intro">Intro</a><ol><li><a href="#intro-1">Intro</a></li></ol></li></ol></nav><h1 id="intro">Intro</h1><h2 id="intro-1">Intro</h2><p>Long text over the limit</p>',
    );
    expect(toMarkdown(html, options)).toBe(
      '[TOC]\n\n# Intro\n\n## Intro\n\nLong text over the limit',
    );
  });
});
