// @vitest-environment node
import { Window } from 'happy-dom';
import { createTeiEditor } from '../../src/core/create.js';
import { Html } from '../../src/extensions/html/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { Table } from '../../src/extensions/table/index.js';
import { convert, renderToHTML, toJSON, toMarkdown, toText } from '../../src/server/index.js';

const options = { extensions: [StarterKit] };

// happy-dom's windows share their element classes: a fix left in place by
// one render would stay for every page after it.
const REPLACE_WITH = new Window().Element.prototype.replaceWith;
afterEach(() => {
  expect(new Window().Element.prototype.replaceWith).toBe(REPLACE_WITH);
});

const HTML =
  '<h1>Title</h1><p>Some <strong>bold</strong> and <a href="https://example.com">a link</a>.</p>' +
  '<ul><li>one</li><li>two</li></ul><pre data-language="ts"><code class="language-ts">let x = 1;\nx++;</code></pre>';

describe('server rendering', () => {
  it('runs with no DOM, and leaves none behind', () => {
    expect(typeof document).toBe('undefined');
    renderToHTML(HTML, options);
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it('renders HTML, Markdown and text from HTML', () => {
    expect(renderToHTML(HTML, options)).toBe(HTML);
    expect(toMarkdown(HTML, options)).toBe(
      '# Title\n\nSome **bold** and [a link](https://example.com).\n\n- one\n- two\n\n```ts\nlet x = 1;\nx++;\n```',
    );
    expect(toText(HTML, options)).toBe(
      'Title\n\nSome bold and a link.\n\none\n\ntwo\n\nlet x = 1;\nx++;',
    );
  });

  it('renders saved JSON as the browser editor would', () => {
    const json = toJSON(HTML, options);
    expect(renderToHTML(json, options)).toBe(HTML);
    expect(renderToHTML(JSON.stringify(json), { ...options, from: 'json' })).toBe(HTML);
  });

  it('reads Markdown', () => {
    expect(renderToHTML('## Hi\n\n*there*', { ...options, from: 'markdown' })).toBe(
      '<h2>Hi</h2><p><em>there</em></p>',
    );
  });

  it('drops scripts, handlers and unsafe URLs from hostile content', () => {
    const html = renderToHTML(
      '<p onclick="alert(1)">x<script>alert(2)</script><a href="javascript:alert(3)">y</a><img src=x onerror="alert(4)"></p>',
      options,
    );
    expect(html).not.toMatch(/script|onclick|onerror|javascript:/i);
    const json = {
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'paragraph',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'link',
                version: 1,
                url: 'javascript:alert(1)',
                rel: null,
                target: null,
                title: null,
                direction: null,
                format: '',
                indent: 0,
                children: [
                  {
                    type: 'text',
                    version: 1,
                    text: '<img src=x onerror=alert(1)>',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const out = renderToHTML(json, options);
    expect(out).not.toContain('javascript:');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('refuses content that does not parse, whole', () => {
    expect(() => renderToHTML({ root: {} }, options)).toThrow(/root: \{ children/);
    expect(() => renderToHTML('{"root":', { ...options, from: 'json' })).toThrow();
    expect(typeof document).toBe('undefined');
  });

  it('throws in production too, where an editor would only log', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => renderToHTML({ root: { children: [{ type: 'nope' }] } }, options)).toThrow();
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it('uses only the extensions it is given', () => {
    // HTML in and out needs the Html extension; without one, it says so.
    expect(() => convert('<p>Hi</p>', 'html', { extensions: [] })).toThrow(
      /no "html" content format/,
    );
    // Without heading nodes, a heading's text is kept as a paragraph.
    expect(convert('<h1>Hi</h1>', 'html', { extensions: [Html] })).toBe('<p>Hi</p>');
  });

  it('matches what an editor gives for the same content', () => {
    const editor = createTeiEditor({ ...options, content: toJSON(HTML, options) });
    // The editor itself needs a DOM for HTML; JSON and Markdown need none.
    expect(editor.getMarkdown()).toBe(toMarkdown(HTML, options));
    expect(editor.getJSON()).toEqual(toJSON(HTML, options));
    editor.destroy();
  });

  it('renders tables, from HTML and from Markdown, and leaves the DOM as it found it', () => {
    const tables = { extensions: [StarterKit, Table] };
    const html =
      '<p>a</p><table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr>' +
      '<tr><td colspan="2"><p>wide</p></td></tr></tbody></table><p>b</p>';
    // happy-dom removed a node replaced with itself, which Lexical's
    // export does to every table: none reached the page.
    expect(renderToHTML(html, tables)).toBe(html);
    expect(
      renderToHTML('| A | B |\n| --- | --- |\n| 1 | 2 |', { ...tables, from: 'markdown' }),
    ).toBe(
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
    );
    expect(toMarkdown(html, tables)).toBe('a\n\n| A | B |\n| --- | --- |\n| wide |  |\n\nb');
  });

  it('fixes the DOM of a page that has its own only for the call', async () => {
    const page = new Window();
    const globals = { window: page, document: page.document, DOMParser: page.DOMParser };
    Object.assign(globalThis, globals);
    try {
      expect(
        renderToHTML('<table><tr><td>x</td></tr></table>', { extensions: [StarterKit, Table] }),
      ).toContain('<table>');
      expect(page.Element.prototype.replaceWith).toBe(REPLACE_WITH);
    } finally {
      for (const name of Object.keys(globals)) Reflect.deleteProperty(globalThis, name);
      await page.happyDOM.close();
    }
  });
});
