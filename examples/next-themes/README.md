# @teispace/next-themes — examples

A Next.js 16 app that exercises every feature of the package. Each route is a self-contained demo with inline source code.

## Run it

```bash
# from the monorepo root
yarn install
yarn workspace next-themes-examples dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Routes

| Route | What it shows |
|---|---|
| `/` | Home + links to every demo |
| `/basic` | Minimal light / dark / system toggle |
| `/typed` | `createThemes({ themes: [...] as const })` factory with 4 themes |
| `/transitions` | View Transitions API — fade, circular (cursor/center), custom CSS |
| `/ssr` | Server-side `getTheme()` + client hint + server action cookie writes |
| `/scoped` | `<ScopedTheme>` — sub-tree overrides via class or data-attribute |
| `/themed` | `<ThemedImage>` and `<ThemedIcon>` |
| `/hooks` | `useThemeValue` (value maps) + `useThemeEffect` (change callbacks) |
| `/storage` | Side-by-side comparison of the five storage modes |
| `/advanced` | `forcedTheme`, `disableTransitionOnChange`, array attributes, `value` map, CSP nonce, `themeColor`, `respectReducedMotion`, `onChange` |

## Implementation notes

- Root provider lives in `src/app/providers.tsx` (client) and is wrapped around the app in `src/app/layout.tsx` (server).
- `getTheme()` reads the cookie on the server and seeds `initialTheme`, so the first paint already has the correct theme.
- Tailwind v4 is wired with `@teispace/next-themes/tailwind.css` — the `dark:` and `light:` variants work with both `attribute="class"` and `attribute="data-theme"` providers. Extra `sepia:` and `mint:` variants are added in `globals.css`.
- The app uses `attribute="class"` so CSS like `.dark { --bg: ... }` works directly.
