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
<hr>
<p>That is the whole document. Make it yours.</p>
`;
