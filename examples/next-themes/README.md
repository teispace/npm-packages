# @teispace/next-themes — examples

A Next.js 16 app that exercises every feature of the package. Each route is a self-contained demo with inline source code.

## Run it

```bash
# from the monorepo root
yarn install
yarn workspace next-themes-examples dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Browser checks

```bash
yarn workspace next-themes-examples playwright install chromium firefox webkit
yarn workspace next-themes-examples test:e2e
```

The Playwright suite rebuilds the package, builds the app and serves it with `next start` under the strict policy in `src/proxy.ts`. The dev server needs a relaxed policy for hot reload, so only the production build is tested. In Chromium, Firefox and WebKit it checks for zero CSP violations, both from the in-page `securitypolicyviolation` event and from `report-uri` (`src/app/api/csp-report`), across:

- theme switches with `disableTransitionOnChange` and with View Transitions;
- back/forward-cache restores, which re-run the inline script;
- each of those with constructable stylesheets and without them (the `<style nonce>` fallback).

`e2e/harness.spec.ts` serves two policies the Next.js app can't isolate: a hash-only `script-src` using `getThemeScriptHash()`, with a tampered-script control, and `require-trusted-types-for 'script'` with no policy allowed.

## Routes

| Route | What it shows |
|---|---|
| `/` | Home + links to every demo |
| `/basic` | Minimal light / dark / system toggle |
| `/typed` | Custom themes — 7 live (light, dark, sepia, mint, solarized, dracula, nord) via the `createThemes({ themes: [...] as const })` factory |
| `/transitions` | View Transitions API — fade, circular (cursor/center), custom CSS |
| `/ssr` | Server-side `getTheme()` + client hint + server action cookie writes |
| `/scoped` | `<ScopedTheme>` — sub-tree overrides via class or data-attribute |
| `/themed` | `<ThemedImage>` and `<ThemedIcon>` |
| `/hooks` | `useThemeValue` (value maps) + `useThemeEffect` (change callbacks) |
| `/storage` | Side-by-side comparison of the five storage modes |
| `/csp` | The whole app runs under a strict nonce CSP (`src/proxy.ts`); theme switches with transitions report zero violations |
| `/advanced` | `forcedTheme`, `disableTransitionOnChange`, array attributes, `value` map, CSP nonce, `themeColor`, `respectReducedMotion`, `onChange` |

## Implementation notes

- Root provider lives in `src/app/providers.tsx` (client) and is wrapped around the app in `src/app/layout.tsx` (server).
- `getTheme()` reads the cookie on the server and seeds `initialTheme`, so the first paint already has the correct theme.
- Tailwind v4 is wired with `@teispace/next-themes/tailwind.css` — the `dark:` and `light:` variants work with both `attribute="class"` and `attribute="data-theme"` providers. Extra `sepia:` and `mint:` variants are added in `globals.css`.
- The app uses `attribute="class"` so CSS like `.dark { --bg: ... }` works directly.
