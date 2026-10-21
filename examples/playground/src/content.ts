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
<h2>Callouts, pull quotes and page breaks</h2>
<div data-tei-callout="tip"><p>Type <code>/callout</code> to set lines apart. Click the icon to change its kind;
in markdown it is a GitHub alert, <code>&gt; [!TIP]</code>.</p></div>
<aside data-tei-pull-quote>A pull quote sets a line of your own text large, to draw the eye.</aside>
<p>Press <code>⌘↵</code> for a page break: printed, the page ends there.</p>
<hr data-tei-page-break>
<hr>
<p>That is the whole document. Make it yours.</p>
`;
