# @teispace/teieditor

A rich text editor for React, built on [Lexical](https://lexical.dev). One
element gives you a complete editor; every part of it can be configured,
replaced or rebuilt from the same pieces it is made of.

```tsx
import { Editor } from '@teispace/teieditor/react';
import { full } from '@teispace/teieditor/presets/full';
import '@teispace/teieditor/styles.css';

<Editor preset={full} content={saved} onChange={save} placeholder="Write something…" />;
```

- **Complete out of the box.** Toolbar, bubble menu, slash menu, block handles
  with drag and drop, context menu, tables with merged cells, images with
  captions, embeds, callouts, columns, find and replace, mentions, emoji,
  comments, suggested changes, equations, drawings, real-time collaboration
  with versions, and an AI menu for your own model. Everything the Lexical
  playground does, and then some, all free.
- **Light where it counts.** Presets, extensions and stylesheets are separate
  entries. `<Editor>` on its own is about 47 KB gzipped; each feature costs
  only what it adds, and the UI for a feature loads after the editor shows,
  only when that feature is installed.
- **Plain CSS.** One stylesheet in `@layer teieditor`, built on CSS
  variables, with your shadcn/ui theme one attribute away. No Tailwind, Sass
  or build step, and any rule of yours wins without `!important`.
- **Strict-CSP clean.** No inline styles or `<style>` tags; works under a
  nonce-based Content Security Policy with no `'unsafe-inline'`.
- **Server rendering without a flash.** Render the document to HTML on the
  server, and the editor takes over the same boxes when it mounts.
- **Headless when you want it.** A typed command API (`chain`, `can`,
  `isActive`), selectors for React, and server-side conversion between JSON,
  HTML, Markdown and text.

## Contents

- [Install](#install)
- [Presets](#presets)
- [Styles](#styles)
- [Content](#content)
- [Customizing the UI](#customizing-the-ui)
- [Commands and state](#commands-and-state)
- [Extensions](#extensions)
- [Collaboration, comments, AI and more](#collaboration-comments-ai-and-more)
- [Writing an extension](#writing-an-extension)
- [Server rendering](#server-rendering)
- [Own the source: CLI and shadcn registry](#own-the-source-cli-and-shadcn-registry)
- [Security](#security)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Accessibility, RTL and touch](#accessibility-rtl-and-touch)
- [Browser support](#browser-support)

## Install

```sh
npx @teispace/teieditor init
```

`init` writes an editor component into your app and prints the one install
command for everything it needs, for your package manager (`--install` runs
it). Or install by hand:

```sh
npm install @teispace/teieditor lexical @lexical/clipboard @lexical/code-core \
  @lexical/code-prism @lexical/extension @lexical/history @lexical/html \
  @lexical/link @lexical/list @lexical/markdown @lexical/react \
  @lexical/rich-text @lexical/selection @lexical/utils
```

Lexical's packages are peer dependencies, so your app has one copy of each.
Some features need one more; the extensions table says which. The `full` and
`notion` presets also need `@lexical/table`, `@lexical/overflow` and
`@lexical/hashtag`; `full` needs `@lexical/mark` for comments too.

React 18.3 or 19. The editor's own runtime dependency is `@floating-ui/dom`.

## Presets

A preset is a list of extensions plus which parts of the UI come with them.
Each one is its own entry, so you only ship the one you import.

| Preset | What you get |
| --- | --- |
| `full` | Every feature, a toolbar, a word count, comments, dictation, and the document tools (import and export, Markdown source, pages, visible whitespace). |
| `notion` | Every block and inline feature with no toolbar: select text for the bubble menu, type `/` or press + for blocks, drag blocks by their handle, `@` for people, `:` for emoji. |
| `minimal` | Writing basics with a toolbar and links, nothing floating. For comment boxes and forms. |

```tsx
import { notion } from '@teispace/teieditor/presets/notion';

<Editor preset={notion} />;
```

Without a preset, `<Editor>` installs StarterKit (paragraphs, headings,
quotes, lists, check lists, code blocks, links, formatting, alignment,
history, Markdown shortcuts) and shows the UI for whatever you install.

A preset is plain data, so you can change one:

```tsx
import { Mention } from '@teispace/teieditor/extensions/mention';
import { notion } from '@teispace/teieditor/presets/notion';

const extensions = notion.extensions.map((ext) =>
  ext === Mention ? Mention.configure({ search: findPeople }) : ext,
);

<Editor preset={notion} extensions={extensions} />;
```

Presets work without React too: `createTeiEditor({ extensions: full.extensions })`.

Features that need a package of their own (equations, drawings, Shiki,
collaboration, AI) are in no preset: add them to one, as above.

## Styles

```ts
import '@teispace/teieditor/styles.css'; // everything, ~14 KB gzipped
```

Or only what you use:

```ts
import '@teispace/teieditor/styles/core.css'; // tokens, StarterKit's blocks, the UI
import '@teispace/teieditor/styles/tables.css';
import '@teispace/teieditor/styles/media.css'; // images, files, embeds
```

The feature files are `blocks` (pull quotes, callouts, collapsibles, page
breaks), `cards` (cards, sticky notes), `columns`, `widgets` (polls, dates),
`media`, `tables`, `document-tools` (table of contents, word count),
`inline-extras` (keywords, autocomplete, special text, ruby), `find`, `views`
and `typeahead` (mentions, hashtags, emoji). Each needs `core.css` first.

**Theme.** Every colour, radius, font and spacing is a `--tei-*` variable.
In a shadcn/ui app (Tailwind v4 theme variables), `data-tei-theme="shadcn"`
on the editor, or on any ancestor of it, maps them to yours: `--tei-bg` reads
`--background`, `--tei-accent` reads `--primary`, and so on.

```tsx
<Editor frameProps={{ 'data-tei-theme': 'shadcn' }} />
```

Or set any of them yourself:

```css
.tei {
  --tei-font: 'Inter', sans-serif;
  --tei-radius: 0.75rem;
  --tei-accent: oklch(0.6 0.2 260);
}
```

**Dark mode** follows the page: a `.dark` class or `data-theme="dark"` on an
ancestor, or the system setting. `<Editor colorScheme="dark">` forces one.

**Saved HTML** looks the same as the editor under a `tei-prose` class:
`<article className="tei-prose" dangerouslySetInnerHTML={{ __html: html }} />`.
Columns and cards size themselves to that element, so give it a width.

## Content

`content` takes HTML, a Markdown string with `contentFormat="markdown"`, or
Lexical JSON. `onChange` reports each document change (not selection moves)
in `format`: `json` (the default, lossless), `html`, `markdown` or `text`.

```tsx
<Editor content={saved} onChange={(value) => save(value)} format="html" />
```

Outside `onChange`, read and write through the editor:

```ts
editor.getJSON();
editor.getHTML();
editor.getMarkdown();
editor.getText();
editor.setContent('<p>Hello</p>'); // or JSON, or setContent(md, 'markdown')
editor.isEmpty;
```

To keep a handle on the editor, make it with `useTeiEditor` and pass it in:

```tsx
const editor = useTeiEditor({ extensions: full.extensions, content: saved });

<Editor editor={editor} preset={full} />;
<button onClick={() => save(editor.getJSON())}>Save</button>;
```

## Customizing the UI

Each layer goes deeper than the one before; use the first that does the job.

**Props.** `placeholder`, `editable`, `bordered`, `colorScheme`,
`stickyToolbar`, `toolbarOverflow` (`menu`, `scroll` or `wrap` for a toolbar
that doesn't fit), `contentProps` and `frameProps` for attributes on the
document and the frame.

**Slots.** Turn any part off, or put your own in its place:

```tsx
<Editor
  preset={full}
  slots={{
    contextMenu: false, // the browser's own right-click menu
    toolbar: <MyToolbar />, // yours, inside the editor's context
    footer: <SaveStatus />,
  }}
/>
```

The slots are `toolbar`, `bubbleMenu`, `slashMenu`, `linkPopover`,
`blockHandle`, `contextMenu`, `codeBlockBar`, `tableControls`,
`imageControls`, `fileControls`, `embedControls`, `calloutMenu`, `stickyMenu`,
`columnsMenu`, `dateTimePicker`, `findReplace`, `wordCount`, `rubyPopover`,
`typeaheadMenu`, `emojiPicker` and `footer`.

**Toolbar layout.** Groups of item ids, controls or your own elements:

```tsx
<Editor
  toolbar={[
    ['undo', 'redo'],
    ['blockType'],
    ['bold', 'italic', 'link'],
    [<MyButton key="ai" />],
  ]}
/>
```

What doesn't fit moves into a "More" menu, lowest priority first.

**Items.** Every button and menu entry comes from an extension's `items`. Add,
replace or hide any by id, everywhere it appears:

```tsx
useTeiEditor({
  extensions,
  items: {
    strike: null, // gone from the toolbar, bubble menu and slash menu
    wordCount: { id: 'wordCount', label: 'Words', in: ['toolbar'], run: showStats },
  },
});
```

**Words and icons.** `messages` replaces any string by id (translations,
wording); `icons` replaces any icon by name.

**Classes.** Every part has a stable `tei-*` class and a `data-tei-part`
attribute. Wrap the editor in `TeiUIContext` to add classes by part, swap
icons, or drop the built-in classes entirely:

```tsx
<TeiUIContext.Provider value={{ classNames: { button: 'my-button' }, unstyled: false }}>
  <Editor />
</TeiUIContext.Provider>
```

**Build your own.** Every part is exported (`EditorToolbar`, `BubbleMenu`,
`SlashMenu`, `BlockHandle`, `TableControls`, …) along with the primitives
they are made of (`Button`, `Toolbar`, `Popover`, `Menu`, `DropdownMenu`,
`Dialog`, `ColorPicker`, `GridPicker`, …) and the hooks behind them
(`useBlockMenu`, `useTableMenu`, `useMenuEntries`, `useItemStates`). Put
`EditorContent` and the parts you want inside one tree:

```tsx
const editor = useTeiEditor({ extensions: notion.extensions });

<EditorProvider editor={editor}>
  <MyToolbar />
  <EditorContent editor={editor}>
    <BubbleMenu />
    <SlashMenu />
  </EditorContent>
</EditorProvider>;
```

Or copy a part's source into your app and change it there: see
[Own the source](#own-the-source-cli-and-shadcn-registry).

## Commands and state

Every feature is a set of commands, typed by the extensions you install:

```ts
editor.commands.toggleBold();
editor.chain().focus().toggleHeading(2).insertTable(3, 3).run(); // one update, one undo step
editor.can().toggleBulletList(); // would it do anything here?
editor.isActive('heading', 2);
```

In React, `useEditorState` re-renders only when what you select changes:

```tsx
const { bold, words } = useEditorState(
  (e) => ({ bold: e.isActive('bold'), words: e.getText().split(/\s+/).length }),
  { editor, equal: shallowEqual },
);
```

Events: `onCreate`, `onUpdate`, `onSelectionUpdate`, `onFocus`, `onBlur`,
`onDestroy` as options, or `editor.on('onUpdate', fn)` at any time.

**Overrides.** Options passed when the editor is made apply after every
extension, so they win:

```ts
useTeiEditor({
  extensions,
  commands: { toggleBold: { run: ({ next }) => (track('bold'), next()) } }, // wrap
  keymap: { underline: null, bold: { key: 'Mod-Shift-b', command: 'toggleBold' } },
  middleware: [(call, next) => (call.check ? next() : audit(call.name, next))],
});
```

## Extensions

Each extension is its own entry: `@teispace/teieditor/extensions/<name>`.
Install them on top of a preset or StarterKit, and their buttons, menu
entries, slash items and shortcuts appear wherever they belong.

```ts
import { Table } from '@teispace/teieditor/extensions/table';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';

useTeiEditor({ extensions: [StarterKit, Table.configure({ maxRows: 50 })] });
```

| Entry | What it adds | Extra peer |
| --- | --- | --- |
| `starter-kit` | Paragraphs, headings, quotes, bullet, numbered and check lists, code blocks with Prism, horizontal rules, links and autolinks, bold to superscript, alignment, indent, placeholders, history, Markdown shortcuts. Turn parts off with `StarterKit.configure({ heading: false })` | |
| `text-style` | Font family and size, text and highlight colours | |
| `table` | Tables: merge and split, header rows and columns, cell colours, vertical alignment, column resizing, frozen first row and column, striping, scroll shadows | `@lexical/table` |
| `image` | Images: upload with progress, URL, paste and drop, resize, captions, alignment, inline images, alt text | |
| `file` | File attachments, uploaded or linked | |
| `embed` | YouTube, Vimeo, X, Figma, Loom and more, with consent before loading, and an offer to embed a pasted link | |
| `blocks` | Block handles: drag to move, a menu to turn into, duplicate, move or delete | |
| `callout` | Info, tip, warning and danger boxes | |
| `pull-quote` | A line set large between two rules | |
| `collapsible` | Sections that open and close, found by the browser's find in page | |
| `columns` | Two to four columns of blocks, which stack on a phone | |
| `card`, `sticky-note` | Cards with an accent, coloured sticky notes | |
| `poll` | Polls with live voting | |
| `date-time` | Dates and times with a picker | |
| `page-break` | Page breaks for print | |
| `table-of-contents` | An outline block and a side panel | |
| `character-count` | Word and character counts, an optional limit | `@lexical/overflow` |
| `find-replace` | Find and replace with case, whole-word and regex options | |
| `emoji` | `:shortcode:` replacement, a `:` list and an emoji picker | |
| `mention` | `@` mentions from your async search, more triggers if you like | |
| `hashtag` | Hashtags | `@lexical/hashtag` |
| `ruby` | Ruby annotations | |
| `keywords`, `autocomplete`, `special-text` | Highlighted keywords, ghost-text completion, `[bracketed]` text and typography as you type | |
| `document-actions` | Import and export files, clear the document, read-only toggle | |
| `markdown-source` | Edit the document as Markdown | |
| `pages`, `show-invisibles`, `tab-focus` | Paginated view, visible whitespace, Tab to leave the editor | |
| `code-highlight` | Prism highlighting (in StarterKit) | |
| `code-shiki` | Shiki highlighting instead of Prism: light and dark themes at once, grammars loaded as needed | `shiki`, `@lexical/code-shiki` |
| `equation` | TeX equations, inline and block, drawn as MathML (no KaTeX CSS or fonts), `$…$` and `$$…$$` in Markdown | `katex` |
| `excalidraw` | Drawings in Excalidraw, saved with their picture | `@excalidraw/excalidraw` |
| `comments` | Comment threads on text: reply, resolve, delete, a panel beside the document, your own store | `@lexical/mark` |
| `review` | Suggested changes: type in suggest mode, then accept or reject each or all | |
| `collaboration` | Real-time editing over Yjs, with cursors, presence and per-user undo | `yjs`, `@lexical/yjs`, `y-protocols` |
| `versions` | Named versions: save, compare, restore; Yjs snapshots when collaborating | |
| `ai` | An AI menu (⌘J, `/ai`, the bubble menu) for your own model, streamed into the document | |
| `speech-to-text` | Dictation with the browser's speech recognition, with voice commands | |
| `tree-view` | A developer panel: the node tree, JSON and HTML, and time travel | `@lexical/devtools-core` |

Options can change after the editor is made: `setExtensionOptions(editor,
Table, { maxRows: 10 })`, and every UI built on them follows.

## Collaboration, comments, AI and more

These load their code, and their package, only when used.

**AI.** Bring your own model: one function gets the request (the action, the
selection, the text around it) and returns text or a stream. The editor
makes no requests of its own.

```ts
import { Ai } from '@teispace/teieditor/extensions/ai';

Ai.configure({
  handler: async (request, { signal }) => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify(request),
      signal,
    });
    return response.body!; // a stream of text, written in as it arrives
  },
});
```

**Collaboration and versions.** Any Yjs provider: y-websocket, Hocuspocus,
or `createBroadcastProvider` for tabs of one browser. Keep the document with
`gc: false` and versions are Yjs snapshots that everyone shares.

```ts
import { Collaboration } from '@teispace/teieditor/extensions/collaboration';
import { Versions } from '@teispace/teieditor/extensions/versions';
import { WebsocketProvider } from 'y-websocket';
import { Doc } from 'yjs';

const doc = new Doc({ gc: false });
const extensions = [
  ...notion.extensions,
  Collaboration.configure({
    doc,
    provider: new WebsocketProvider('wss://your.server', 'doc-42', doc, { connect: false }),
    user: { name: 'Ada', color: '#2563eb' },
  }),
  Versions,
];
```

Content comes from the shared document; an empty one is seeded from
`initialContent` (or the editor's `content`). `<Editor>` shows who is here
and the versions panel (`editor.commands.toggleVersions()`).

**Comments and suggested changes.** Threads are kept by a `CommentStore` (in
memory by default); give it your backend's to save them.

```ts
import { Comments } from '@teispace/teieditor/extensions/comments';
import { Review } from '@teispace/teieditor/extensions/review';

const me = { id: 'u1', name: 'Ada Lovelace', color: '#2563eb' };
[Comments.configure({ user: me, store: myStore }), Review.configure({ user: me })];
```

Select text and press ⌘⌥M to comment. In suggest mode (⌘⌥⇧X), typing and
deleting become suggestions to accept or reject. Suggest mode tracks text,
not formatting or block structure.

**Equations.** KaTeX loads with the first equation on the page. To render
equations on the server, give it KaTeX: `Equation.configure({ katex })`.

**Drawings.** Import Excalidraw's stylesheet in your app,
`import '@excalidraw/excalidraw/index.css'`. Excalidraw loads its fonts
from `esm.sh` after any copy you host (`window.EXCALIDRAW_ASSET_PATH`), and
browsers fetch that too: under a CSP, add `font-src https://esm.sh`.

## Writing an extension

The built-in features are written with the same public API, so anything they
do, yours can:

```ts
import { defineTeiExtension, getExtensionOptions } from '@teispace/teieditor';
import { $getSelection, $isRangeSelection } from 'lexical';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    insertSignature: [name: string];
  }
}

export const Signature = defineTeiExtension({
  name: 'my-app/signature',
  config: { prefix: '— ' },
  commands: {
    insertSignature: {
      run: ({ editor }, name: string) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        const prefix = getExtensionOptions(editor, Signature)?.prefix ?? '';
        selection.insertText(`${prefix}${name}`);
        return true;
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  keymap: { signature: { key: 'Mod-Alt-s', command: 'insertSignature', args: ['Me'] } },
  items: [{ id: 'signature', label: 'Signature', icon: 'pencil', in: ['slash', 'toolbar'], command: 'insertSignature', args: ['Me'] }],
});
```

A spec can also carry Lexical `nodes`, `dependencies`, reactive `storage`,
`active` states for `isActive`, `messages`, `icons`, Markdown transformers,
and `register(editor, ctx)` for anything Lexical can do. To change a built-in
extension rather than write a new one, use `.configure()` for its options or
`.extend()` to replace any of its commands, keys, items or messages by name;
an overriding command can call the original through `next()`.

## Server rendering

```tsx
import { renderToHTML } from '@teispace/teieditor/server';

const html = renderToHTML(saved, { extensions: full.extensions });

// The document, readable before scripts load, with no layout shift as the editor takes over:
<Editor preset={full} content={saved} initialHTML={html} />;

// Or just show it:
<article className="tei-prose" dangerouslySetInnerHTML={{ __html: html }} />;
```

`toMarkdown`, `toText`, `toJSON` and `convert(content, to, options)` convert
between formats with the same extensions. The server entry needs
`@lexical/headless`.

`<Editor>` is a client component (`'use client'`); in the Next.js app router,
render it from a server component and pass `initialHTML`.

## Own the source: CLI and shadcn registry

Copy any part's source into your app, to change as you like:

```sh
npx @teispace/teieditor list            # what there is
npx @teispace/teieditor add bubble-menu # writes src/components/teieditor/bubble-menu.tsx
```

A copied file imports the rest from the package's public entries, as your own
code would, so it keeps working and keeps getting the package's fixes for
everything it uses. `--dir` picks the folder; nothing is overwritten without
`--force`; `--dry-run` shows what would happen.

The same files are a shadcn registry:

```sh
npx shadcn@latest add https://<registry host>/r/teieditor-bubble-menu.json
```

The registry is built into the package (`dist/registry`); serve that folder
from your docs site, as the playground does at `/r/<item>.json`.

## Security

- **Links and sources are checked.** `javascript:`, `vbscript:` and unexpected
  `data:` URLs are refused everywhere: links, images, files, embeds and
  pasted HTML (`isSafeUrl`, `isSafeImageSrc` and the rest are exported).
- **Saved HTML is the editor's own export**, built from the document, never
  pasted markup passed through.
- **Strict CSP.** The editor never writes a `style` attribute or a `<style>`
  element. A policy like this one, with a nonce per request, works as is:

  ```
  default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
  style-src 'self' 'nonce-…'; img-src 'self' data: blob: https:;
  frame-src https://www.youtube-nocookie.com https://player.vimeo.com …
  ```

  Add `frame-src` for the embed providers you enable, and `font-src
  https://esm.sh` for Excalidraw's fonts. The e2e suite runs every feature
  under such a policy and fails on any violation.

## Keyboard shortcuts

`Mod` is ⌘ on macOS and Ctrl elsewhere. Remap or turn off any of them with
the `keymap` option.

| Keys | Does |
| --- | --- |
| Mod-B, Mod-I, Mod-U | Bold, italic, underline |
| Mod-Shift-X | Strikethrough |
| Mod-E | Inline code |
| Mod-Shift-H | Highlight |
| Mod-, / Mod-. | Subscript, superscript |
| Mod-\\ | Clear formatting |
| Mod-K | Link |
| Mod-Alt-0 | Paragraph |
| Mod-Alt-1 … Mod-Alt-6 | Heading 1 to 6 |
| Mod-Shift-7 / 8 / 9 | Numbered, bullet, check list |
| Ctrl-Shift-Q | Quote |
| Mod-Alt-C | Code block |
| Mod-Alt-7 | Collapsible section |
| Mod-] / Mod-[ | Indent, outdent |
| Tab / Shift-Tab | Nest or lift a list item; next or previous column |
| Mod-Shift-↑ / ↓ | Move the block |
| Mod-D | Duplicate the block |
| Mod-Enter | Page break |
| Mod-Shift-. / Mod-Shift-, | Larger, smaller text |
| Mod-F / Mod-Alt-F | Find, replace |
| Mod-G or F3 | Next match |
| Mod-Alt-E | Emoji picker |
| Mod-J | Ask AI |
| Mod-Shift-M | Inline equation |
| Mod-Alt-M | Comment |
| Mod-Alt-Shift-X | Suggest mode |
| Mod-Z / Mod-Shift-Z | Undo, redo |
| `/` | Slash menu |

Markdown shortcuts work as you type: `#` for headings, `-` or `1.` for lists,
`[]` for a check list, `>` for a quote, ` ``` ` for code, `---` for a rule,
`**bold**`, `_italic_`, `` `code` ``, `~~strike~~`.

## Accessibility, RTL and touch

- Menus, the toolbar and dialogs follow the WAI-ARIA patterns: roving focus,
  arrow keys, Escape to close, focus returned where it came from. The slash
  and mention lists keep focus in the text and announce the highlighted row
  through `aria-activedescendant`.
- Every part is reachable by keyboard, and the e2e suite runs axe over the
  editor with its menus, popovers and dialogs open.
- Layout uses logical properties, so right-to-left documents need nothing.
- On touch screens the targets are larger, the block handle follows the
  caret, and menus fit a 375px phone.
- `prefers-reduced-motion` turns animations off.

## Browser support

The last two versions of Chrome, Edge, Firefox and Safari, from Chrome 123,
Firefox 125 and Safari 17.5 (the first with both `light-dark()` and the
Popover API). Tested in Chromium, Firefox and WebKit, desktop and mobile.

## License

MIT
