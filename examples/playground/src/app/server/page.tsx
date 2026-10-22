import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { renderToHTML, toMarkdown } from '@teispace/teieditor/server';
import { DEMO } from '@/content';

/**
 * A server component: no editor in the browser, no client JavaScript for
 * the article. The same extensions and exporters as `editor.getHTML()`, so
 * what is saved from the editor renders here as the editor showed it.
 */
export default function Page() {
  const html = renderToHTML(DEMO, { extensions: [StarterKit], from: 'html' });
  const markdown = toMarkdown(DEMO, { extensions: [StarterKit], from: 'html' });
  return (
    <>
      <h1>Server render</h1>
      <p className="lead">
        Saved content rendered by <code>renderToHTML</code> in a server component. The article is
        static HTML styled by the editor&apos;s stylesheet (the <code>tei-prose</code> class); the
        Markdown beside it comes from <code>toMarkdown</code>.
      </p>
      <div className="split">
        <article
          className="tei-prose card"
          data-testid="server-html"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the editor's own export, made on the server
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <aside className="panel">
          <h2>Markdown</h2>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls, and a keyboard scrolls what has focus */}
          <pre className="output" tabIndex={0} aria-label="Markdown">
            {markdown}
          </pre>
        </aside>
      </div>
    </>
  );
}
