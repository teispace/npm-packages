/** The document most pages start from: a bit of everything StarterKit does. */
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
<hr>
<p>That is the whole document. Make it yours.</p>
`;
