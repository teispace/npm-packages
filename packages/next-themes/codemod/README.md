# Migration codemod — `next-themes` → `@teispace/next-themes`

Automated transform that rewrites imports, requires, and dynamic imports from `next-themes` to `@teispace/next-themes`. Handles ESM and CJS, `.ts`/`.tsx`/`.js`/`.jsx`.

## Run it

```bash
# default: rewrite imports only
npx jscodeshift --parser=tsx \
  -t node_modules/@teispace/next-themes/codemod/from-next-themes.cjs \
  src/

# also stamp storage="hybrid" onto every <ThemeProvider>
npx jscodeshift --parser=tsx \
  -t node_modules/@teispace/next-themes/codemod/from-next-themes.cjs \
  src/ \
  --storage=hybrid
```

## What it does

- `import { ThemeProvider } from 'next-themes'` → `from '@teispace/next-themes'`
- `import x from 'next-themes/dist/foo'` → `from '@teispace/next-themes/foo'`
- `require('next-themes')` → `require('@teispace/next-themes')`
- Dynamic `import('next-themes')` → `import('@teispace/next-themes')`
- `export * from 'next-themes'` and `export { x } from 'next-themes'`
- With `--storage=<mode>`: adds `storage="<mode>"` to every `<ThemeProvider>` that doesn't already set one. Accepts `hybrid`, `cookie`, `local`, `session`, `none`.

## What it does *not* do

- Doesn't add `getTheme()` server reads — that's an opt-in architectural change.
- Doesn't change `attribute`, `defaultTheme`, or any other prop semantics — the API is API-compatible for all existing next-themes props.
- Doesn't touch CSS (`.dark` vs `[data-theme="dark"]`). If you were using `class` attribute, you stay using `class`.

## After the codemod

Check that your app still boots. Then consider opting into the new features:

- **Hybrid storage** for zero-flash SSR: set `storage="hybrid"` (or use `--storage=hybrid` above).
- **Server-rendered theme**: `await getTheme()` from `@teispace/next-themes/server` in your root layout, then pass `initialTheme` to `<ThemeProvider>`.
- **View transitions**: add `transition="circular"` or `transition="fade"`.
- **Typed themes**: switch to the `createThemes({ themes: [...] as const })` factory.

See the package README for full docs.
