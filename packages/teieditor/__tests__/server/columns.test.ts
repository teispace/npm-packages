// @vitest-environment node
import { Columns } from '../../src/extensions/columns/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { renderToHTML, toMarkdown } from '../../src/server/index.js';

const options = { extensions: [StarterKit, Columns] };

describe('columns on the server', () => {
  it('reads and writes ours and the Lexical playground’s, with no DOM globals', () => {
    const html =
      '<div data-tei-columns="2fr 1fr"><div data-tei-column="2"><p>A</p></div><div data-tei-column="1"><p>B</p></div></div>';
    expect(renderToHTML(html, options)).toBe(html);
    expect(
      renderToHTML(
        '<div data-lexical-layout-container="true" style="grid-template-columns: 1fr 2fr 1fr"><div data-lexical-layout-item="true"><p>1</p></div><div data-lexical-layout-item="true"><p>2</p></div><div data-lexical-layout-item="true"><p>3</p></div></div>',
        options,
      ),
    ).toBe(
      '<div data-tei-columns="1fr 2fr 1fr"><div data-tei-column="1"><p>1</p></div><div data-tei-column="2"><p>2</p></div><div data-tei-column="1"><p>3</p></div></div>',
    );
    expect(toMarkdown(html, options)).toBe(
      '<!-- columns 2fr 1fr -->\n\nA\n\n<!-- column -->\n\nB\n\n<!-- /columns -->',
    );
  });
});
