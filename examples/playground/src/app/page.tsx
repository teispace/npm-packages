import { renderToHTML } from '@teispace/teieditor/server';
import { DEMO } from '@/content';
import { EXTENSIONS } from '@/extensions';
import { Showcase } from './showcase';

export default function Page() {
  return (
    <>
      <h1>The editor</h1>
      <p className="lead">
        One element: <code>{'<Editor preset={full} />'}</code>, every feature. Switch the preset and
        the UI follows; the document stays, because the editor comes from <code>useTeiEditor</code>.
      </p>
      {/* The document is in the page's HTML: no blank editor while scripts load. */}
      <Showcase initialHTML={renderToHTML(DEMO, { extensions: EXTENSIONS, from: 'html' })} />
    </>
  );
}
