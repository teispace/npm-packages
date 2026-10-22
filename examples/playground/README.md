# TeiEditor playground

A Next.js app that shows `@teispace/teieditor` 5 in each of its setups. It uses the package from this workspace, so a change to `packages/teieditor` shows up here after a rebuild.

| Route        | What it shows                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `/`          | The full `<Editor>`, with live settings (preset, toolbar, editable, colour scheme) and its output as HTML, Markdown and JSON. |
| `/notion`    | The `notion` preset: no frame, no toolbar, a slash menu and a placeholder on each empty block.             |
| `/comments`  | A comment box: the `minimal` preset, a trimmed kit, ⌘/Ctrl+Enter posts, posts shown with `.tei-prose`.     |
| `/customize` | Customizing through options only: a toolbar layout, an item of your own, messages, a remapped key, tokens. |
| `/headless`  | `useTeiEditor`, `EditorContent` and `useEditorState` with the page's own buttons and no editor UI.         |
| `/server`    | A server component rendering saved content with `renderToHTML` and `toMarkdown` from `/server`.            |

The theme switch is `@teispace/next-themes`, given the request's CSP nonce.

## Running it

```bash
yarn workspace @teispace/teieditor build
yarn workspace teieditor-playground dev
```

Then open <http://localhost:3000>.

## Browser checks

```bash
yarn workspace teieditor-playground playwright install chromium firefox webkit
yarn workspace teieditor-playground test:e2e
```

Every page is served under the strict policy in `src/proxy.ts`: a nonce for scripts and `<style>` elements, and no `'unsafe-inline'` anywhere, style attributes included. The dev server needs a relaxed policy for hot reload, so the suite rebuilds the package, builds the app and tests it with `next start`. In Chromium, Firefox and WebKit it checks:

- typing, formatting, the slash menu and theme switches on every editor page cause no CSP violations, counted from both the in-page `securitypolicyviolation` event and `report-uri` (`src/app/api/csp-report`);
- pasted HTML can't put a `javascript:` or `data:text/html` URL into a link or an image;
- the link editor refuses `javascript:` and turns `example.com/docs` into an `https://` link;
- server-rendered check lists are disabled, checked task-list boxes, styled by `.tei-prose`;
- per-block placeholders show, with a contrast of at least 3:1, in light and dark mode.

A control test injects an un-nonced `<style>` and a style attribute and expects both to be reported, so a clean run means the policy is really being enforced.
