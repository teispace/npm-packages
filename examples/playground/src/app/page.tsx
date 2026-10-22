import { Equation } from '@teispace/teieditor/extensions/equation';
import { renderToHTML } from '@teispace/teieditor/server';
import katex from 'katex';
import { DEMO } from '@/content';
import { EXTENSIONS } from '@/extensions';
import { Showcase } from './showcase';

/**
 * The showcase's extensions, with KaTeX at hand: equations are MathML in the
 * server's HTML, as the editor draws them, so nothing moves as it mounts.
 */
const SERVER_EXTENSIONS = EXTENSIONS.map((extension) =>
  extension === Equation ? Equation.configure({ katex }) : extension,
);

export default function Page() {
  return (
    <>
      <h1>The editor</h1>
      <p className="lead">
        One element: <code>{'<Editor preset={full} />'}</code>, every feature. Switch the preset and
        the UI follows; the document stays, because the editor comes from <code>useTeiEditor</code>.
      </p>
      {/* The document is in the page's HTML: no blank editor while scripts load. */}
      <Showcase initialHTML={renderToHTML(DEMO, { extensions: SERVER_EXTENSIONS, from: 'html' })} />
    </>
  );
}
