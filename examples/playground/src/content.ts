import { DRAWING_PREVIEW, DRAWING_SCENE } from './demo-drawing';

/** The document most pages start from: a bit of everything the showcase installs. */
export const DEMO = `
<h1>Welcome to teieditor</h1>
<p>A rich text editor on <a href="https://lexical.dev">Lexical</a>. Select text for the
<strong>bubble menu</strong>, type <code>/</code> on an empty line for blocks, or press
<code>⌘K</code> for a link.</p>
<p>Text styles too: <span style="color: #dc2626;">colour</span>,
<span style="background-color: rgb(234 179 8 / 0.35);">highlight</span>,
<span style="font-size: 20px;">size</span> and
<span style="font-family: Georgia, serif;">font</span>, from the toolbar or the bubble menu.</p>
<h2>Markdown as you type</h2>
<ul>
  <li><code>#</code> to <code>######</code> and a space make headings, <code>&gt;</code> a quote</li>
  <li><code>-</code>, <code>1.</code> and <code>[]</code> make lists</li>
  <li><code>**bold**</code>, <code>*italic*</code>, <code>\`code\`</code> and <code>~~struck~~</code></li>
</ul>
<blockquote>Everything here works with the keyboard alone.</blockquote>
<ol>
  <li>Type</li>
  <li>Format</li>
</ol>
<ul data-lexical-list-type="check">
  <li aria-checked="true">Strict CSP, no inline styles</li>
  <li aria-checked="false">Your next idea</li>
</ul>
<pre><code class="language-ts">const editor = useTeiEditor({ extensions: [StarterKit] });
editor.chain().focus().toggleBold().run();</code></pre>
<h2>Tables</h2>
<p>Insert one from the toolbar or <code>/table</code>. Hover for the <strong>+</strong> bars,
drag a column edge to resize it, and open a cell's menu from its corner or a right-click.</p>
<table>
  <tr><th>Feature</th><th>Keys</th><th>Notes</th></tr>
  <tr><td>Next cell</td><td><code>Tab</code></td><td>Adds a row past the last cell</td></tr>
  <tr><td>Select cells</td><td><code>Shift</code> + arrows</td><td style="background-color: rgba(59, 130, 246, 0.16);">Then merge them</td></tr>
  <tr><td colspan="2">Markdown and HTML, both ways</td><td>GFM tables</td></tr>
</table>
<h2>Images</h2>
<p>Drop or paste a picture, or insert one from the toolbar or <code>/image</code>. Click it to align it,
add alt text or a caption, and drag a corner to resize it.</p>
<figure><img src="/hills.svg" alt="Green hills under a summer sun" width="400" height="240"><figcaption>A caption is part of the document: type in it, undo it, copy it.</figcaption></figure>
<p><img src="/hills.svg" alt="Hills" width="160" height="96" data-inline="" data-float="end">An image can also
sit in a line of text, <img src="/hills.svg" alt="" width="30" height="18" data-inline=""> like this one, or
float to a side with the text wrapping round it, like the one here. Type <code>![alt](src)</code> after some
text for one, or turn <em>In line with text</em> on in an image's toolbar.</p>
<h2>Files</h2>
<p>Drop any other file, or attach one from the toolbar or <code>/file</code>. Click a card to download,
rename or replace it; in a read-only document, the card is a download link.</p>
<a href="/release-notes.pdf" download="Release notes.pdf" data-tei-file="" data-ext="PDF" data-size="193" title="193 B" type="application/pdf">Release notes.pdf</a>
<h2>Embeds</h2>
<p>Paste a YouTube, Vimeo, Loom, X or Figma link on a line of its own and press <code>Enter</code> to embed it,
or insert one from the toolbar or <code>/embed</code>. Click an embed to align it, open its page or copy its link;
once selected, it plays.</p>
<div data-tei-embed="youtube" data-id="aqz-KE-bpKQ"></div>
<h2>Equations and drawings</h2>
<p>Type <code>$e^{i\\pi} + 1 = 0$</code> for an equation in a line: <span data-tei-equation="inline" data-tex="e^{i\\pi} + 1 = 0"></span>.
Click one to edit its TeX with a live preview. <code>$$</code> and a space starts one of its own:</p>
<div data-tei-equation="block" data-tex="\\int_0^1 x^2\\,dx = \\tfrac{1}{3}"></div>
<p>A drawing, from <code>/drawing</code>: double-click it to open Excalidraw.</p>
<div data-tei-excalidraw data-scene="${DRAWING_SCENE}"><img src="${DRAWING_PREVIEW}" alt="A box, an arrow and a circle"></div>
<h2>Comments and suggestions</h2>
<p>Select text and press <code>⌘⌥M</code> to comment. Turn on suggesting from the toolbar, and what you type
<ins data-tei-suggestion="demo-1" data-author="grace" data-author-name="Grace Hopper" datetime="2026-10-01T09:00:00.000Z">is proposed</ins><del data-tei-suggestion="demo-2" data-author="grace" data-author-name="Grace Hopper" datetime="2026-10-01T09:00:00.000Z">goes straight in</del>
for someone to accept or reject.</p>
<h2>Callouts, pull quotes and page breaks</h2>
<div data-tei-callout="tip"><p>Type <code>/callout</code> to set lines apart. Click the icon to change its kind;
in markdown it is a GitHub alert, <code>&gt; [!TIP]</code>.</p></div>
<aside data-tei-pull-quote>A pull quote sets a line of your own text large, to draw the eye.</aside>
<p>Press <code>⌘↵</code> for a page break: printed, the page ends there.</p>
<hr data-tei-page-break>
<details open><summary>Sections that open and close</summary>
<p>Type <code>/toggle</code> or press <code>⌘⌥7</code> to fold lines under a title. Click the chevron, or press
<code>⌘⌥↵</code>, to open or close it. Saved, it is <code>&lt;details&gt;</code>: it opens and closes with no script.</p>
</details>
<hr>
<p>That is the whole document. Make it yours.</p>
`;
