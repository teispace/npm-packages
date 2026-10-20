# TeiEditor playground

A Next.js app that shows `@teispace/teieditor` in each of its setups. It uses the package from this workspace, so a change to `packages/teieditor` shows up here after a rebuild.

| Route         | What it shows                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `/basic`      | The drop-in `TeiEditor` from `@teispace/teieditor/react`.                                        |
| `/notion`     | The drop-in `TeiEditorNotion`: no toolbar, with slash commands, the bubble menu and drag handles. |
| `/customize`  | Choosing extensions and options.                                                                 |
| `/forms`      | The editor as a form field.                                                                      |
| `/themed`     | Overriding the `--tei-*` tokens.                                                                 |
| `/playground` | The kitchen sink: every extension, with the scaffolded UI in `src/components/teieditor`.         |

`src/components/teieditor` is what `npx teieditor init` copies into an app, kept in step with `packages/teieditor/src/registry`.

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

- typing, formatting, the slash menu and theme switches on `/basic`, `/notion` and `/playground` cause no CSP violations, counted from both the in-page `securitypolicyviolation` event and `report-uri` (`src/app/api/csp-report`);
- pasted HTML can't put a `javascript:` or `data:text/html` URL into a link or an image;
- the link editor refuses `javascript:` and turns `example.com/docs` into an `https://` link;
- per-block placeholders show, with a contrast of at least 3:1, in light and dark mode.

A control test injects an un-nonced `<style>` and a style attribute and expects both to be reported, so a clean run means the policy is really being enforced.
