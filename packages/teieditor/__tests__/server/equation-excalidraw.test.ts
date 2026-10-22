// @vitest-environment node
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { Equation } from '../../src/extensions/equation/index.js';
import { Excalidraw, svgDataURL } from '../../src/extensions/excalidraw/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { renderToHTML, toJSON, toMarkdown } from '../../src/server/index.js';

const md = 'Euler: $e^{i\\pi} + 1 = 0$\n\n$$\\int_0^1 x\\,dx$$';

describe('equations on the server, with no DOM globals', () => {
  it('without KaTeX: the TeX in a <code>, labelled, which reads back', () => {
    const options = { extensions: [StarterKit, Equation.configure({ katex: null })] };
    const html = renderToHTML(md, { ...options, from: 'markdown' });
    expect(html).toBe(
      '<p>Euler: <span data-tei-equation="inline" data-tex="e^{i\\pi} + 1 = 0" role="math" aria-label="e^{i\\pi} + 1 = 0"><code>e^{i\\pi} + 1 = 0</code></span></p>' +
        '<div data-tei-equation="block" data-tex="\\int_0^1 x\\,dx" role="math" aria-label="\\int_0^1 x\\,dx"><code>\\int_0^1 x\\,dx</code></div>',
    );
    expect(toMarkdown(html, options)).toBe(md);
  });

  it('with KaTeX given: MathML, no style attribute, the same Markdown back', () => {
    const options = { extensions: [StarterKit, Equation.configure({ katex })] };
    const html = renderToHTML(md, { ...options, from: 'markdown' });
    expect(html).toContain('<math');
    expect(html).toContain('display="block"');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('katex-html');
    expect(toMarkdown(html, options)).toBe(md);
    expect(JSON.stringify(toJSON(html, options))).toContain('"equation":"e^{i\\\\pi} + 1 = 0"');
  });
});

describe('drawings on the server', () => {
  it('render their picture as an <img>, and read back whole', () => {
    const preview = svgDataURL('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>');
    const options = { extensions: [StarterKit, Excalidraw] };
    const doc = {
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
            type: 'excalidraw',
            version: 1,
            elements: [{ id: 'a', type: 'ellipse', version: 2 }],
            files: {},
            preview,
            altText: 'A circle',
          },
        ],
      },
    };
    const html = renderToHTML(doc, options);
    expect(html).toContain(`<img src="${preview}" alt="A circle">`);
    expect(html).toContain('data-scene="{&quot;elements&quot;:[{&quot;id&quot;:&quot;a&quot;');
    expect(html).not.toContain('style=');
    expect(renderToHTML(html, options)).toBe(html);
    expect(JSON.stringify(toJSON(html, options))).toContain('"elements":[{"id":"a"');
  });
});
