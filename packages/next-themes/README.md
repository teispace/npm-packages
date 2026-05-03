# @teispace/next-themes

> Feature-rich, lightweight, production-grade theme management for Next.js and React.
> Hybrid cookie + localStorage storage, typed themes, View Transitions, scoped sub-trees, Tailwind v4 preset, zero-FOUC SSR, codemod from `next-themes`.

```bash
yarn add @teispace/next-themes
```

---

## Contents

- [Why another theme library?](#why-another-theme-library)
- [Install](#install)
- [Quick start](#quick-start)
  - [Next.js App Router](#nextjs-app-router)
  - [Vite / Remix / Generic React](#vite--remix--generic-react)
- [Core concepts](#core-concepts)
  - [Attributes and selectors](#attributes-and-selectors)
  - [Storage modes](#storage-modes)
  - [The resolved theme](#the-resolved-theme)
  - [The inline anti-FOUC script](#the-inline-anti-fouc-script)
- [Server-side rendering](#server-side-rendering)
  - [Reading the theme server-side](#reading-the-theme-server-side)
  - [Prefers-color-scheme client hint](#prefers-color-scheme-client-hint)
  - [Writing the cookie from server actions](#writing-the-cookie-from-server-actions)
- [Typed factory — `createThemes`](#typed-factory--createthemes)
- [Hooks](#hooks)
  - [`useTheme`](#usetheme)
  - [`useThemeValue`](#usethemevalue)
  - [`useThemeEffect`](#usethemeeffect)
- [Components](#components)
  - [`<ThemedImage />`](#themedimage-)
  - [`<ThemedIcon />`](#themedicon-)
  - [`<ScopedTheme />`](#scopedtheme-)
- [View transitions](#view-transitions)
- [Tailwind](#tailwind)
  - [Tailwind v4](#tailwind-v4)
  - [Tailwind v3](#tailwind-v3)
- [Storage adapters (advanced)](#storage-adapters-advanced)
- [Migration from `next-themes`](#migration-from-next-themes)
- [Full API reference](#full-api-reference)
  - [`ThemeProvider` props](#themeprovider-props)
  - [`setTheme(theme, options?)`](#setthemetheme-options)
  - [Types](#types)
  - [Exports by subpath](#exports-by-subpath)
- [Recipes](#recipes)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Performance & bundle sizes](#performance--bundle-sizes)
- [Browser support](#browser-support)
- [Examples app](#examples-app)
- [License](#license)

---

## Why another theme library?

`next-themes` by paco is battle-tested, but in 2026 it has unresolved React 19 bugs, no first-class server-side theme reading, and broken multi-class cleanup. `@wrksz/themes` rewrote the core, but ships cookie-only SSR (no cross-tab sync) and lacks a typed factory.

**`@teispace/next-themes` aims to be the complete rewrite:**

- **Hybrid storage** — cookie is authoritative for SSR (zero flash) while `localStorage` mirrors for cross-tab sync. No other library ships this combination.
- **`useSyncExternalStore`** — theme state lives outside React's render tree, so it survives React 19 `Activity` / `cacheComponents` / suspension without going stale.
- **`useServerInsertedHTML` script injection** — avoids the React 19 inline-script client warning and places the blocker where it actually blocks.
- **Per-instance stores** — nested `<ThemeProvider>`s are genuinely independent. No hidden global state.
- **View Transitions** — opt into cursor-origin circular reveals or fade animations with one prop.
- **`createThemes<T>()`** — full literal-type inference for your theme list across provider, hooks, and components.
- **Five storage modes** — `hybrid`, `cookie`, `local`, `session`, `none`.
- **`Sec-CH-Prefers-Color-Scheme` client hint** — zero-flash SSR even for first-time visitors without a cookie.
- **Five subpath entries** — `.`, `/client`, `/server`, `/adapters`, `/script`, `/tailwind`, `/tailwind.css`, `/codemod/from-next-themes`. You pay only for what you import.
- **Codemod** from `next-themes` — one `npx jscodeshift` command rewrites your imports.

---

## Install

```bash
yarn add @teispace/next-themes
# or
npm install @teispace/next-themes
# or
pnpm add @teispace/next-themes
# or
bun add @teispace/next-themes
```

**Peer dependencies:** `react ≥ 18`, `react-dom ≥ 18`, `next ≥ 13` (optional — only if you use the default Next entry).

---

## Quick start

### Next.js App Router

Three files: a provider boundary, a server-side seed, and your app code.

```tsx
// app/layout.tsx — STAYS A SERVER COMPONENT
import { ThemeProvider } from '@teispace/next-themes';
import { getTheme } from '@teispace/next-themes/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = await getTheme();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" initialTheme={initialTheme ?? undefined}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**No `'use client'` required in your code.** `<ThemeProvider>` ships its own client boundary, so you can drop it into a server component (including `app/layout.tsx`) and Next.js handles the boundary automatically. Your `<html>`, `<body>`, and any siblings remain server-rendered.

```tsx
// any client component
'use client';
import { useTheme } from '@teispace/next-themes';

export function Toggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle
    </button>
  );
}
```

That's it. The anti-FOUC script is injected server-side via `useServerInsertedHTML`, the theme is read from the cookie on the server, and the client picks up without mismatch.

#### Zero-flicker setup (recommended for production)

`useServerInsertedHTML` places the script wherever React reaches its first flush boundary — usually inside `<body>`. With streaming, partial prerendering, or `cacheComponents`, the body's first bytes can paint before the script lands, briefly showing the wrong theme. To eliminate every possible flicker source, render the script directly in `<head>` and tell the provider to skip its own injection:

```tsx
// app/layout.tsx — still a server component
import { ThemeProvider } from '@teispace/next-themes';
import { getTheme, getThemeScript } from '@teispace/next-themes/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = await getTheme();
  const themeScript = getThemeScript({
    attribute: 'class',
    initialTheme: initialTheme ?? undefined,
  });
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: anti-FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider attribute="class" initialTheme={initialTheme ?? undefined} noScript>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

This guarantees the inline script runs **before** the browser paints any body pixels, regardless of how Next.js streams the response. Pass the same options to `getThemeScript()` and `<ThemeProvider>` so they stay in sync — or use [`createThemes()`](#typed-factory--createthemes) so the configuration lives in one place.

### Vite / Remix / Generic React

```tsx
// App.tsx
import { ThemeProvider, useTheme } from '@teispace/next-themes/client';

export function App() {
  return (
    <ThemeProvider attribute="class">
      <Inner />
    </ThemeProvider>
  );
}

function Inner() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle</button>;
}
```

The `/client` entry uses an inline `<script suppressHydrationWarning>` instead of `useServerInsertedHTML`. API is otherwise identical.

---

## Core concepts

### Attributes and selectors

The provider applies the active theme to the target element (default `<html>`) as an HTML attribute. You control which attribute with the `attribute` prop:

```tsx
<ThemeProvider attribute="class">              // <html class="dark">
<ThemeProvider attribute="data-theme">         // <html data-theme="dark">
<ThemeProvider attribute={['class', 'data-theme']}>  // both
```

Your CSS then scopes styles to that attribute:

```css
/* class attribute */
.dark { --bg: #0f1115; }

/* data-theme attribute */
[data-theme="dark"] { --bg: #0f1115; }
```

If your CSS expects a different value than your logical theme name, use `value`:

```tsx
<ThemeProvider
  themes={['light', 'dark', 'solarized']}
  attribute="class"
  value={{
    dark: 'theme-dark',
    solarized: 'theme-solarized high-contrast',  // multi-class works
  }}
>
```

The library cleans up stale classes on every switch — including every value in the `value` map — so moving between multi-class themes never leaves leftovers.

### Storage modes

Pick where the user's choice persists:

| Mode | Server-readable | Cross-tab sync | When to use |
|---|:-:|:-:|---|
| `hybrid` *(default)* | ✅ | ✅ | Zero-flash SSR + multi-tab apps. |
| `cookie` | ✅ | — | SSR apps where cross-tab doesn't matter. |
| `local` | — | ✅ | SPAs with no server rendering. |
| `session` | — | — | Per-tab, forgotten on close. |
| `none` | — | — | `forcedTheme` or in-memory only. |

```tsx
<ThemeProvider storage="hybrid" storageKey="theme" />
```

**Hybrid semantics.** Cookie is authoritative on read (so the server and the inline script read the same value), while `localStorage` mirrors for cross-tab `storage` events. Writes go to both.

### The resolved theme

There are two theme values:

- `theme` — the *selected* theme, which may be `'system'`.
- `resolvedTheme` — the *concrete* theme after system resolution (always one of your real themes).

```ts
const { theme, resolvedTheme } = useTheme();
// theme:         'system'
// resolvedTheme: 'dark'   (user's OS preference)
```

Use `resolvedTheme` for rendering decisions (CSS, assets), and `theme` for toggle UI state.

### The inline anti-FOUC script

On the server, the provider emits a tiny, synchronous, blocking `<script>` inside `<head>` (via `useServerInsertedHTML` on Next, via React's `dangerouslySetInnerHTML` with `suppressHydrationWarning` elsewhere). That script:

1. Reads the theme from your configured storage (cookie first, then localStorage, then `initialTheme`, then `defaultTheme`).
2. Resolves `'system'` via `matchMedia('(prefers-color-scheme: dark)')`.
3. Applies the correct attribute + class + `color-scheme` + `<meta name="theme-color">` to the target element.
4. Optionally freezes CSS transitions for one frame.

It runs **before** React hydrates, **before** first paint, so the correct theme is visible in the first rendered frame — no flash.

The script accepts a `nonce` for CSP environments and always wraps its body in a `try/catch` so it is silent on any runtime error (never blocks rendering).

---

## Server-side rendering

### Reading the theme server-side

```tsx
import { getTheme } from '@teispace/next-themes/server';

export default async function RootLayout({ children }) {
  const initialTheme = await getTheme();
  // Preference order: theme cookie → Sec-CH-Prefers-Color-Scheme hint → null
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider initialTheme={initialTheme ?? undefined}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Prefers-color-scheme client hint

Modern browsers can send `Sec-CH-Prefers-Color-Scheme: light|dark` on each request — but only after the server asks for it via `Accept-CH`. With this hint, a first-time visitor with no cookie still gets zero-flash SSR matching their OS preference.

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import { acceptClientHintsHeader } from '@teispace/next-themes/server';

export function middleware() {
  const res = NextResponse.next();
  res.headers.set('Accept-CH', acceptClientHintsHeader());
  // → 'Accept-CH: Sec-CH-Prefers-Color-Scheme'
  return res;
}
```

After this runs once, subsequent navigations include the hint and `getTheme()` picks it up automatically.

### Writing the cookie from server actions

When you persist the theme from the server (e.g. on a user-preferences save):

```ts
'use server';
import { writeThemeCookie } from '@teispace/next-themes/server';

export async function saveTheme(theme: string) {
  await writeThemeCookie(theme);
  // ...persist to your user profile here
}
```

Or, for custom servers / edge workers, build the header yourself:

```ts
import { setThemeCookie } from '@teispace/next-themes/server';

response.headers.set('Set-Cookie', setThemeCookie('dark', {
  maxAge: 60 * 60 * 24 * 365,
  secure: true,
  domain: '.example.com',
}));
```

---

## Typed factory — `createThemes`

For maximum type safety, create a typed theme module once and import from it everywhere.

```ts
// app/theme.ts
'use client';
import { createThemes } from '@teispace/next-themes';

export const {
  ThemeProvider,
  useTheme,
  useThemeValue,
  useThemeEffect,
  ThemedImage,
  ThemedIcon,
  ScopedTheme,
} = createThemes({
  themes: ['light', 'dark', 'sepia', 'mint'] as const,   // ← literal tuple
  defaultTheme: 'system',
  attribute: 'class',
  storage: 'hybrid',
  // any ThemeProvider prop works as a default:
  disableTransitionOnChange: true,
  themeColor: { light: '#fff', dark: '#0f1115' },
});
```

Now every consumer gets literal types:

```tsx
import { useTheme, useThemeValue, ScopedTheme } from '@/app/theme';

const { theme, setTheme } = useTheme();
// theme:   'light' | 'dark' | 'sepia' | 'mint' | 'system'
// setTheme(value)  — value is typed to the union above

const accent = useThemeValue({
  light: '#2563eb',
  dark:  '#60a5fa',
  sepia: '#b45309',
  mint:  '#0f766e',
  // unknown keys are a compile error
});

<ScopedTheme theme="sepia">...</ScopedTheme>
// ScopedTheme.theme is typed too
```

Per-use props on the returned `ThemeProvider` override the factory defaults, so you can still customize per-mount (e.g. set a different `defaultTheme` on an auth page).

**When to use the factory vs. the generic hook.** The factory gives perfect inference from a single config. The generic `useTheme<T>()` takes a type parameter per-call and is handy for quick prototyping. Use the factory for shipped code.

---

## Hooks

### `useTheme`

```ts
const {
  theme,          // string — the selected value (may be 'system')
  resolvedTheme,  // string — the concrete theme after system resolution
  systemTheme,    // 'light' | 'dark' | null
  forcedTheme,    // string | null — echoes the forcedTheme prop
  themes,         // string[] — list of available themes (includes 'system' when enableSystem)
  setTheme,       // (theme, options?) => void
} = useTheme();
```

Typing:

```ts
// generic form (no factory)
const { theme, setTheme } = useTheme<'light' | 'dark' | 'sepia'>();
```

### `useThemeValue`

Map the active theme to a value. Resolution order: `resolvedTheme` → raw `theme` → `map.default`.

```tsx
import { useThemeValue } from '@teispace/next-themes';

const accent = useThemeValue({ light: '#2563eb', dark: '#60a5fa', default: '#000' });
const copy   = useThemeValue({ light: 'Day mode', dark: 'Night mode' });
```

Returns `undefined` when no key matches and no default is provided.

### `useThemeEffect`

Like `useEffect`, but **skips the first render** and only fires on theme changes. Perfect for analytics, server-sync, one-shot side effects.

```tsx
import { useThemeEffect } from '@teispace/next-themes';

function Analytics() {
  useThemeEffect((theme, resolvedTheme) => {
    track('theme_changed', { theme, resolvedTheme });
    return () => abortPending();  // optional cleanup on next change
  });
  return null;
}
```

Deps work the same as `useEffect`:

```tsx
useThemeEffect((theme) => { /* ... */ }, [user.id]);
```

---

## Components

### `<ThemedImage />`

Swap `<img src>` based on the active theme. Reads from the external store directly, so when the provider is seeded with `initialTheme` from the server cookie, the **very first render** (server and client) picks the correct variant — no mount flag, no post-hydration swap, no flash.

```tsx
import { ThemedImage } from '@teispace/next-themes';

<ThemedImage
  sources={{ light: '/logo-light.svg', dark: '/logo-dark.svg' }}
  fallbackSrc="/logo-light.svg"
  alt="Brand logo"
  width={240}
  height={100}
  className="rounded-md"
/>
```

If the resolved theme could legitimately differ between server and client (e.g. `theme="system"` with no client hint), wrap the usage in a `<span suppressHydrationWarning>` or use the CSS pattern below.

For pixel-perfect SSR switching driven entirely by CSS, use theme-scoped `display`:

```css
html[data-theme="dark"] .logo-light { display: none; }
html[data-theme="dark"] .logo-dark  { display: block; }
```

### `<ThemedIcon />`

Same idea for arbitrary React nodes — SVG icons, logos, anything.

```tsx
import { ThemedIcon } from '@teispace/next-themes';

<ThemedIcon
  variants={{ light: <SunIcon />, dark: <MoonIcon /> }}
  fallback={<SunIcon />}
/>
```

### `<ScopedTheme />`

Force a sub-tree to a specific theme without touching the page root. Inside the scope, `useTheme()` reports the scoped theme and `setTheme` is a no-op.

```tsx
import { ScopedTheme } from '@teispace/next-themes';

<ScopedTheme theme="dark">
  <Modal />  {/* always dark, regardless of page theme */}
</ScopedTheme>

// render as any element, with any attribute strategy
<ScopedTheme theme="sepia" as="section" attribute="data-theme" className="preview">
  <Preview />
</ScopedTheme>

// map theme names to CSS class/attribute values
<ScopedTheme theme="dark" value={{ dark: 'theme-dark' }}>...</ScopedTheme>
```

Props: `theme`, `children`, `as?` (default `'div'`), `attribute?` (default `'class'`), `value?`, plus any DOM props passed through to the wrapper element.

---

## View transitions

Animate theme changes with the [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API). Gracefully no-ops where the API is unsupported (Firefox as of 2026).

### Provider-level default

```tsx
<ThemeProvider transition="circular">{children}</ThemeProvider>
```

### Per-call override

```tsx
const { setTheme } = useTheme();

setTheme('dark');                                    // uses provider default
setTheme('dark', { transition: 'circular' });        // override
setTheme('dark', { transition: false });             // skip animation this time
```

### Shorthand values

| Value | Effect |
|---|---|
| `true` or `'fade'` | Browser-default cross-fade |
| `'circular'` | Circular reveal expanding from the last pointerdown (or viewport center if none) |
| `'none'` or `false` | Disabled |

### Full options

```tsx
<ThemeProvider
  transition={{
    type: 'circular',                       // 'fade' | 'circular' | 'none'
    duration: 500,                          // ms
    easing: 'cubic-bezier(.4, 0, .2, 1)',
    origin: 'cursor',                       // 'cursor' | 'center' | { x: 100, y: 200 }
    css: '...',                             // fully custom ::view-transition CSS
  }}
>
```

### Reduced motion

Transitions (and the transition-disabling freeze) are automatically skipped when the user has `prefers-reduced-motion: reduce`. Pass `respectReducedMotion={false}` to opt out.

### Custom CSS recipe

For a full-page slide reveal:

```tsx
setTheme(next, {
  transition: {
    type: 'fade',
    duration: 600,
    css: `
::view-transition-old(root) { animation: out 600ms cubic-bezier(.4,0,.2,1); }
::view-transition-new(root) { animation: in  600ms cubic-bezier(.4,0,.2,1); }
@keyframes out { to { opacity: 0; transform: translateY(-10px); } }
@keyframes in  { from { opacity: 0; transform: translateY( 10px); } }`,
  },
});
```

---

## Tailwind

### Tailwind v4

Import the preset once in your app CSS; `dark:` and `light:` variants work everywhere.

```css
@import "tailwindcss";
@import "@teispace/next-themes/tailwind.css";
```

The preset matches **both** `attribute="class"` *and* `attribute="data-theme"` providers, so you can switch strategies without changing your markup.

```html
<!-- either of these works -->
<html data-theme="dark">...
<html class="dark">...
```

Add custom variants for additional themes:

```css
@custom-variant sepia (
  &:where([data-theme="sepia"], [data-theme="sepia"] *, .sepia, .sepia *)
);
@custom-variant mint (
  &:where([data-theme="mint"], [data-theme="mint"] *, .mint, .mint *)
);
```

Usage in markup:

```html
<div class="bg-white text-slate-900 dark:bg-slate-900 dark:text-white sepia:bg-amber-100">
  ...
</div>
```

### Tailwind v3

```ts
// tailwind.config.ts
import { darkMode, themeVariant } from '@teispace/next-themes/tailwind';
import plugin from 'tailwindcss/plugin';

export default {
  darkMode,
  plugins: [
    plugin(({ addVariant }) => {
      addVariant('sepia', themeVariant('sepia'));
      addVariant('mint',  themeVariant('mint'));
    }),
  ],
};
```

---

## Storage adapters (advanced)

Each storage mode resolves to a tiny adapter with the shape:

```ts
interface StorageAdapter {
  get(): string | null;
  set(value: string): void;
  subscribe?(cb: (value: string | null) => void): () => void;
}
```

You can import adapter factories directly if you need to inspect values or roll your own:

```ts
import {
  localAdapter,
  cookieAdapter,
  sessionAdapter,
  hybridAdapter,
  resolveAdapter,
  readCookieFromString,
  serializeCookie,
} from '@teispace/next-themes/adapters';

const a = hybridAdapter({ key: 'theme', cookie: { name: 'theme' } });
a.get();        // current value, if any
a.set('dark');
```

`resolveAdapter({ mode, key, cookieOptions })` returns the adapter the provider would use for a given config — handy for tests or sync-from-server flows.

---

## Migration from `next-themes`

The API is drop-in compatible for almost every `next-themes` app. Run the codemod:

```bash
npx jscodeshift --parser=tsx \
  -t node_modules/@teispace/next-themes/codemod/from-next-themes.cjs \
  src/
```

This rewrites:

- `import ... from 'next-themes'` → `'@teispace/next-themes'`
- `require('next-themes')` and dynamic `import('next-themes')`
- `export { x } from 'next-themes'` and `export * from 'next-themes'`
- `'next-themes/dist/<sub>'` → `'@teispace/next-themes/<sub>'`

Pass `--storage=hybrid` (or `cookie` / `local` / `session` / `none`) to also stamp `storage="<mode>"` on every `<ThemeProvider>`:

```bash
npx jscodeshift --parser=tsx \
  -t node_modules/@teispace/next-themes/codemod/from-next-themes.cjs \
  src/ \
  --storage=hybrid
```

**Behavioral differences to be aware of:**

1. Default `storage` is `'hybrid'` (was localStorage-only). To preserve exact old behavior, set `storage="local"`.
2. `onChange(theme, resolvedTheme)` in this lib receives both values (was just the selected value). Harmless change unless you branched on the single argument.
3. Nested `<ThemeProvider>` in this lib maintain independent state — the outer one no longer leaks. If you were relying on nested providers being no-ops, remove the inner ones.
4. `<ThemedImage>` / `<ThemedIcon>` no longer use a mount-flag delay — when the provider has `initialTheme` seeded from the cookie, the first render is correct. If you relied on `fallbackSrc` showing for a frame, remove that expectation; otherwise this is a strict improvement.
5. `ThemeProvider`, hooks, and theme-aware components ship with the `'use client'` directive baked in. You can drop `<ThemeProvider>` directly into a server `app/layout.tsx` — no wrapper file needed.

**Upstream `next-themes` issues this package resolves:**

| # | Issue | How we fix it |
|---|---|---|
| #389 | `localStorage.getItem is not a function` on Node 25 (`window === globalThis`) | Capability probes (`hasLocalStorage()`, `isDom()`, ...) instead of `typeof window` checks. |
| #387 / #385 | Inline `<script>` warning in React 19 / Next 16 | Script injected via `useServerInsertedHTML`, or out of the React tree via `getThemeScript()` in `<head>`. |
| #375 | Stale theme with `cacheComponents` / `Activity` | Store lives outside React via `useSyncExternalStore` — never stale. |
| #374 | `react-hooks/set-state-in-effect` ESLint warning | We never `setState` in effect; external store updates flow through `useSyncExternalStore`. |
| #373 | Tailwind v4 toggle failure | First-class v4 preset at `@teispace/next-themes/tailwind.css`. |
| #371 | `prefers-color-scheme` ignored | Script + store both subscribe to the media query directly. |
| #370 / #369 / #368 | `__name is not defined` / minification / Cloudflare flash | Inline script body is a raw string literal (not a serialized function); build asserts no `__name(` survives. |
| #367 | `children` missing on `ThemeProviderProps` | Props include `children?: ReactNode`. |
| #351 | Theme class removed on back/forward | `pageshow` re-resolves on bfcache restore (script + store). |
| #349 | Generate script string at build time | `getThemeScript()` exported from `/server`. |
| #345 | LS overrides system after `setTheme` | `followSystem` prop forces system tracking and is honored by the inline script. |
| #326 / #325 | Suspense / hydration boundary breaks with provider | `useSyncExternalStore` instead of `useState` + effect. |
| #311 | Image example flickers on initial load | `<ThemedImage>` no longer waits for mount; honors `initialTheme`. |
| #308 / #240 | `enableSystem={false}` + `defaultTheme` | `normalizeSelection` enforces the contract end-to-end. |
| #295 | Don't store in localStorage | `storage="none"`. |
| #292 | Multiple classes per theme | `value` map accepts space-separated class strings. |
| #254 / #215 / #219 | Nested / multi-provider | Per-instance stores; `<ScopedTheme>` for sub-tree overrides. |
| #242 | Flash with `basePath` | Script doesn't depend on path; pre-paint placement via `getThemeScript()` eliminates flash. |
| #236 | Multiple attributes | `attribute={['class', 'data-theme']}`. |
| #226 / #187 | Force theme per route (App Router) | Route-group `<ThemeProvider forcedTheme="...">`. |
| #213 | XSS via cookie / `forcedTheme` value | Inline-script JSON is HTML-safe encoded (`</script>`, U+2028/9 escaped). |
| #199 | Theme flips after login | Hybrid heal-on-read + bfcache `pageshow`. |
| #164 | Track system after `setTheme` | `setTheme('system')` returns to system tracking; or use `followSystem`. |
| #149 | Type-safe themes | `createThemes<T>()` factory with literal-tuple inference. |
| #144 | Class on `<body>` | `target="body"`. |
| #142 | Custom resolved theme | `value` map. |
| #78 | `theme-color` meta sync | `themeColor` prop. |
| #72 | sessionStorage | `storage="session"`. |
| #70 | `finalTheme` | Exposed as `resolvedTheme`. |
| #63 | Storybook `forcedTheme` not applying class | Forced themes apply to DOM on mount. |
| #48 | Init from server DB | `initialTheme` prop, paired with `getTheme()` for cookie reads. |

Genuine open feature requests not in scope: themes-with-themes (#309, #73), storybook addon (#63 has a workaround).

---

## Full API reference

### `ThemeProvider` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | Tree to wrap. |
| `themes` | `string[]` | `['light', 'dark']` | Available theme names. |
| `defaultTheme` | `string` | `'system'` | Theme used when storage is empty. |
| `forcedTheme` | `string` | — | Lock to this value. `setTheme` becomes a no-op. |
| `enableSystem` | `boolean` | `true` | Enable `'system'` as a valid theme + live OS detection. |
| `followSystem` | `boolean` | `false` | Always track OS preference, ignoring storage. |
| `attribute` | `Attribute \| Attribute[]` | `'data-theme'` | HTML attribute(s) on the target element. |
| `value` | `Record<string, string>` | — | Map logical theme → attribute value (supports multi-class). |
| `target` | `string` (selector) | `'html'` | Element that receives the attribute. |
| `storage` | `'hybrid' \| 'cookie' \| 'local' \| 'session' \| 'none'` | `'hybrid'` | Persistence strategy. |
| `storageKey` | `string` | `'theme'` | Key for local/session storage and fallback cookie name. |
| `cookieOptions` | `CookieOptions` | — | Overrides (name, maxAge, path, domain, sameSite, secure). |
| `disableTransitionOnChange` | `boolean \| string` | `false` | Freeze CSS transitions during a switch. Pass a CSS string to scope the freeze. |
| `respectReducedMotion` | `boolean` | `true` | Skip transition-disable + View Transitions when user prefers reduced motion. |
| `enableColorScheme` | `boolean` | `true` | Sync `style.colorScheme` on the target element. |
| `themeColor` | `string \| Record<string, string>` | — | Sync `<meta name="theme-color">`. |
| `initialTheme` | `string` | — | Seed from the server (cookie, DB, session). |
| `nonce` | `string` | — | CSP nonce for the inline anti-FOUC script. |
| `noScript` | `boolean` | `false` | Skip the inline script. Use when you have rendered `getThemeScript()` in `<head>` yourself — most flicker-resistant placement. |
| `transition` | `TransitionConfig` | — | Animate theme changes via View Transitions. |
| `onChange` | `(theme, resolvedTheme) => void` | — | Fires on every theme change. |

### `setTheme(theme, options?)`

```ts
setTheme('dark');
setTheme('dark', {
  // Override the provider-level transition for this call.
  transition: false | true | 'fade' | 'circular' | TransitionOptions,
});
```

### Types

```ts
type Attribute = 'class' | `data-${string}`;

type StorageMode = 'hybrid' | 'cookie' | 'local' | 'session' | 'none';

interface CookieOptions {
  name?: string;
  maxAge?: number;
  path?: string;
  domain?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
}

type TransitionType = 'fade' | 'circular' | 'none';
type TransitionOrigin = 'cursor' | 'center' | { x: number; y: number };
interface TransitionOptions {
  type?: TransitionType;
  duration?: number;       // ms
  easing?: string;         // CSS timing function
  origin?: TransitionOrigin;
  css?: string;            // custom ::view-transition CSS
}
type TransitionConfig = boolean | TransitionType | TransitionOptions;

interface ThemeState {
  theme: string;
  resolvedTheme: string;
  systemTheme: 'light' | 'dark' | null;
  forcedTheme: string | null;
  themes: string[];
}
```

### Exports by subpath

| Import | Purpose |
|---|---|
| `@teispace/next-themes` | Next.js App Router provider + hooks + components + `createThemes` |
| `@teispace/next-themes/client` | Same API, generic React (Vite, Remix, CRA) |
| `@teispace/next-themes/server` | `getTheme`, `getThemeScript`, `setThemeCookie`, `writeThemeCookie`, `readColorSchemeHint`, `acceptClientHintsHeader` |
| `@teispace/next-themes/adapters` | Storage adapter factories + cookie helpers |
| `@teispace/next-themes/script` | `buildScript({...})` — raw inline script builder |
| `@teispace/next-themes/tailwind` | v3 `darkMode` + `themeVariant(name)` helpers |
| `@teispace/next-themes/tailwind.css` | v4 CSS preset (import in your global CSS) |
| `@teispace/next-themes/codemod/from-next-themes` | jscodeshift transform file |

---

## Recipes

### Sync theme to a user profile on the server

```tsx
'use client';
import { ThemeProvider } from '@teispace/next-themes';

<ThemeProvider
  onChange={async (theme) => {
    await fetch('/api/me/theme', {
      method: 'POST',
      body: JSON.stringify({ theme }),
    });
  }}
>
  {children}
</ThemeProvider>
```

### Force a theme on a specific route

```tsx
// app/print/layout.tsx
import { ThemeProvider } from '@teispace/next-themes';

export default function PrintLayout({ children }) {
  return (
    <ThemeProvider forcedTheme="light" storage="none" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
```

### Multi-brand with per-brand defaults

```tsx
// app/[brand]/layout.tsx
import { ThemeProvider } from '@teispace/next-themes';

const BRAND_DEFAULTS: Record<string, { default: string; themes: string[] }> = {
  acme:   { default: 'acme-light',   themes: ['acme-light', 'acme-dark'] },
  globex: { default: 'globex-light', themes: ['globex-light', 'globex-dark'] },
};

export default function BrandLayout({ children, params }) {
  const cfg = BRAND_DEFAULTS[params.brand];
  return (
    <ThemeProvider themes={cfg.themes} defaultTheme={cfg.default}>
      {children}
    </ThemeProvider>
  );
}
```

### CSS variables driven by theme tokens

```css
:root        { --bg: 0 0% 100%; --fg: 0 0% 10%; }
.dark        { --bg: 220 15% 7%; --fg: 0 0% 96%; }
.sepia       { --bg: 40 30% 94%; --fg: 25 25% 20%; }

body {
  background: hsl(var(--bg));
  color: hsl(var(--fg));
}
```

### Build a theme toggle group

```tsx
'use client';
import { useTheme } from '@teispace/next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Theme">
      {(['light', 'system', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

### Access the theme in a non-React context

Import the adapter directly — useful for vanilla scripts or helpers outside the React tree:

```ts
import { resolveAdapter } from '@teispace/next-themes/adapters';

const adapter = resolveAdapter({ mode: 'hybrid', key: 'theme' });
const currentTheme = adapter.get(); // 'light' | 'dark' | 'system' | null
```

Or read the raw cookie on the server:

```ts
import { readCookieFromString } from '@teispace/next-themes/server';
const theme = readCookieFromString(req.headers.get('cookie') ?? '', 'theme');
```

---

## Troubleshooting / FAQ

### I see a hydration warning on `<html>`

Add `suppressHydrationWarning` to your `<html>` tag. The library already does the right thing — the warning is inherent to any inline script that mutates attributes before hydration.

### The first paint is still flashing

Causes, in order of likelihood:

1. **Script runs too late.** `useServerInsertedHTML` places the inline script at the next React flush boundary, which on streamed responses can be inside `<body>` — after some pixels paint. Switch to the [zero-flicker setup](#zero-flicker-setup-recommended-for-production): render `getThemeScript()` directly in `<head>` and pass `noScript` to your provider. This is the most reliable fix.
2. **Storage isn't server-readable.** `storage="local"` and `storage="session"` are client-only. Switch to `'hybrid'` (default) or `'cookie'`.
3. **`initialTheme` not wired.** Without it, the server renders with `defaultTheme`, which may disagree with the cookie-stored preference and cause a one-frame flip:
   ```tsx
   const initialTheme = await getTheme();
   <ThemeProvider initialTheme={initialTheme ?? undefined}>
   ```
4. **Cookie blocked / expired.** Hybrid storage now self-heals: when the cookie is missing but localStorage has a value, the cookie is rewritten on read so the server sees it on the next request. If you still see a flash, check that the cookie isn't blocked by an iframe sandbox, ITP, or a CDN that strips `Set-Cookie`.

### Theme briefly flips when navigating back from another page

This is the browser's bfcache (back/forward cache) showing a stale snapshot. The library now re-runs the inline script on `pageshow` when `event.persisted === true`, and the React store also re-reads storage at the same time. If you've forked the script or pinned an old version, upgrade.

### The circular reveal doesn't expand from the click

`origin: 'cursor'` uses the last pointerdown position. If you trigger `setTheme` from a keyboard event (e.g. a keyboard shortcut) there's no click; it falls back to viewport center. Pass explicit coordinates when you need deterministic origin:

```ts
setTheme(next, { transition: { type: 'circular', origin: { x: 0, y: 0 } } });
```

### Tailwind's `dark:` utilities don't work

Either import the v4 preset (`@import "@teispace/next-themes/tailwind.css";`) or set `darkMode: ['variant', ['&:where([data-theme="dark"] *)', '&:where(.dark *)']]` in your Tailwind v3 config.

### I get "useTheme() called outside a ThemeProvider"

The hook logs this in dev when `useContext(ThemeStoreContext)` returns `null` — i.e. there's no `<ThemeProvider>` ancestor in the React tree at the point `useTheme()` runs. The hook then returns inert defaults instead of throwing, so the page still renders. In React Strict Mode you'll see the message printed twice (one render per pass) — that's expected, not a second bug.

If your code clearly wraps the consumer in `<ThemeProvider>` and you still see this, check in order:

1. **The consumer really is a descendant.** It's easy to read your tree and miss that the call lives in a parallel route slot, an `error.tsx` / `not-found.tsx` rendered above the provider, a server-side path (Route Handler, `metadata`, RSC running before the client provider mounts), or a portal that escapes the subtree. The provider only covers what's rendered as `children`.

2. **Two copies of `@teispace/next-themes` in `node_modules`.** If a dependency pulls in its own copy at a different version, your code and that dependency import different `ThemeStoreContext` objects, so `useContext` on one returns `null` even though the other is mounted. Run `npm ls @teispace/next-themes` (or `pnpm why` / `yarn why`); if you see more than one entry, dedupe (`npm dedupe`, `pnpm dedupe`).

3. **Stale build cache after upgrade.** `rm -rf node_modules .next && <your-pkg-mgr> install` rules this out.

4. **Mixed entries are fine.** Importing `<ThemeProvider>` from `@teispace/next-themes` and `useTheme` from `@teispace/next-themes/client` (or vice versa) shares the same context — the subpaths re-export the same module — so this isn't the cause.

### My CSP blocks the inline script

Pass a nonce:

```tsx
import { headers } from 'next/headers';

const nonce = (await headers()).get('x-nonce') ?? undefined;
<ThemeProvider nonce={nonce}>{children}</ThemeProvider>
```

### I need per-theme images but want zero flash on SSR

Use CSS rather than `<ThemedImage>` for SSR-perfect switching:

```css
.logo-light { display: block; }
.logo-dark  { display: none; }
html[data-theme="dark"] .logo-light { display: none; }
html[data-theme="dark"] .logo-dark  { display: block; }
```

```tsx
<img className="logo-light" src="/logo-light.svg" alt="" />
<img className="logo-dark"  src="/logo-dark.svg"  alt="" />
```

Both are server-rendered; the inline script flips `data-theme` before first paint, so only the right one is ever visible.

### Does it work with React Server Components?

Yes. The provider itself is a client component (as is any stateful hook provider), but you can call `getTheme()` and `setThemeCookie()` / `writeThemeCookie()` from RSC and Server Actions via the `/server` entry. The `<html>` in your root layout stays a server component.

### How do I test it?

The package ships tests for the anti-FOUC script (direct execution in a sandbox), the store, adapters, hooks, components, the factory, and the codemod. If you're testing *your* integration:

- Use `happy-dom` or `jsdom` (Node ≥ 22 users: pass `NODE_OPTIONS='--no-experimental-webstorage'` so your DOM impl's `Storage` isn't shadowed — the package does this for its own test suite and documents it here).
- For Playwright, the anti-FOUC guarantee is observable as "first painted frame has the correct theme"; script evaluation happens before `DOMContentLoaded`.

---

## Performance & bundle sizes

All ESM, unminified — subject to your bundler's minification + gzip. React is externalized.

| Entry | Minified (approx) | Notes |
|---|---:|---|
| `.` (Next.js) | ~3 KB | Includes `useServerInsertedHTML` path |
| `/client` | ~2.9 KB | Inline-script path |
| `/server` | ~2.2 KB | Cookie + client-hint helpers |
| `/adapters` | ~0.3 KB | Re-exports only (tree-shakes to near zero) |
| `/script` | ~0.1 KB | Standalone script builder |
| `/tailwind` (JS) | ~0.5 KB | v3 config helper |
| `tailwind.css` | raw CSS preset | Published unbundled |

Shared code (store, DOM, view transitions, cursor tracker) lives in tree-shakeable chunks; you only load what an entry imports.

**Runtime overhead:**
- `useSyncExternalStore` is React-native — no polyfill.
- The inline anti-FOUC script is ~3.5 KB HTML-embedded (runs once per page load).
- Cursor tracker is a single passive `pointerdown` listener on `document`, installed lazily on first provider mount.

---

## Browser support

| Feature | Support |
|---|---|
| Core | All browsers supported by React 18+ |
| `useSyncExternalStore` | React 18 native |
| `matchMedia` + `Storage` | Evergreen + IE11 (with polyfills) |
| Cookie storage | Evergreen + IE11 |
| View Transitions | Chromium 111+, Safari 18+, Firefox n/a (graceful fallback) |
| `Sec-CH-Prefers-Color-Scheme` | Chromium 93+ (opt-in), behind flag elsewhere |

The View Transitions path detects support and degrades to synchronous theme application where unsupported, with no visual glitches.

---

## Examples app

A full Next.js 16 app with a runnable demo for every feature:

```bash
# from the monorepo root
yarn workspace next-themes-examples dev
```

See [`examples/next-themes/`](../../examples/next-themes). Each route maps to a section of this README.

---

## License

MIT © Teispace
