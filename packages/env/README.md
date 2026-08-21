# @teispace/env

**Type-safe, validated environment variables for every JavaScript runtime and framework.**

Load, validate, coerce, and _type_ your environment — once — and use it everywhere: Node, Bun,
Deno, Cloudflare Workers, Next.js, NestJS, Vite, Nuxt, Astro, SvelteKit, Hono, and plain scripts.
Zero dependencies. Bring your own validator (Zod/Valibot/ArkType via [Standard
Schema](https://standardschema.dev)) or use the built-in coercers.

```ts
import { defineEnv, e } from '@teispace/env';

export const env = defineEnv({
  schema: {
    NODE_ENV: e.enum(['development', 'production', 'test']).default('development'),
    PORT: e.port().default(3000),
    DATABASE_URL: e.url(),
    ENABLE_CACHE: e.boolean().default(false),
  },
});

env.PORT; // number  ← coerced AND typed; never a lying "3000"
env.DATABASE_URL; // string
```

If anything is missing or malformed, you get **one** clear, aggregated error at startup — not a
mysterious `undefined` three layers deep at runtime.

---

## Why another env library?

| | `@teispace/env` | `dotenv` | `@t3-oss/env` | `envalid` |
| --- | :--: | :--: | :--: | :--: |
| Loads `.env` files | ✅ | ✅ | ❌ | ❌ |
| Validates + **coerces** + types | ✅ | ❌ | ✅ | ✅ |
| Types never "lie" (coerced value = typed value) | ✅ | — | ⚠️¹ | ✅ |
| Bring any validator (Zod/Valibot/ArkType) | ✅ | — | ⚠️² | ❌ |
| Built-in coercers (zero-dep path) | ✅ | — | ❌ | ✅ |
| Client/server split + **leak guard** | ✅ | ❌ | ✅ | ❌ |
| Universal runtime (incl. Deno, Bun, **Workers**) | ✅ | ⚠️ | ❌³ | ❌ |
| Framework presets | ✅ | — | ⚠️ | — |
| Dependencies | **0** | 0 | 0 (needs a validator) | 1 |

<sub>¹ t3-env types are correct only if you read the returned object; reading raw `process.env` after a
transform still gives the un-coerced string. We make the returned, **frozen** object the single source of
truth. ² t3-env requires you to supply Zod (now Standard Schema). ³ t3-env is web/Next-oriented; no first-class
Workers context-passing.</sub>

---

## Install

```bash
npm i @teispace/env      # or: pnpm add / yarn add / bun add / deno add npm:@teispace/env
```

Requires Node ≥ 20.9 (or Bun/Deno/Workers). Ships dual ESM + CJS, so `require()` and config loaders that resolve the `require` condition (notably `next.config.ts`) work too.

---

## Core concepts

### 1. Built-in coercers (`e.*`)

Every coercer turns the raw `string | undefined` into a typed, validated value:

```ts
e.string({ min, max, regex, startsWith, endsWith });
e.number({ min, max, int });
e.int({ min, max });
e.port(); // 1–65535
e.boolean(); // true/1/yes/on  vs  false/0/no/off/""
e.url({ protocol }); // validated via WHATWG URL; e.urlObject() returns a URL instance
e.email();
e.enum(['a', 'b', 'c']); // narrows to 'a' | 'b' | 'c'
e.json<T>(innerSchema?); // JSON.parse + optional shape validation
e.array({ separator, trim, of }); // "a,b,c" → string[] (or coerced items via `of`)
e.host();
e.hostname();
```

Constraints like length/range are **constructor options** (`e.string({ min: 1 })`,
`e.number({ min, max })`). The following modifiers are **chainable** on every
coercer and each narrows the type precisely:

```ts
e.string().optional(); //          string | undefined
e.port().default(3000); //         number  (default survives `skipValidation`)
e.string({ min: 1 }).secret(); //  non-empty string, redacted in error output
e.number().refine((n) => n % 2 === 0, 'must be even');
e.string().transform((s) => s.toUpperCase());
e.url().describe('Public API base URL');
e.string().public(); //            opt a scary-named var out of secret redaction
```

> Use `withMeta(schema, { secret: true })` to redact a value validated by a
> Standard Schema (Zod/Valibot), which has no native `.secret()`.

### 2. Bring your own validator (Standard Schema)

Any [Standard Schema](https://standardschema.dev)-compliant value works as a schema entry — Zod,
Valibot, ArkType, etc. Mix-and-match with built-in coercers freely:

```ts
import { z } from 'zod';
import * as v from 'valibot';
import { defineEnv, e } from '@teispace/env';

export const env = defineEnv({
  schema: {
    DATABASE_URL: z.string().url(), // Zod
    REGION: v.picklist(['us', 'eu']), // Valibot
    PORT: e.port().default(3000), // built-in
  },
});
```

> Env validation is synchronous — use synchronous schemas (async Standard Schema validation throws
> a clear error).

### 3. Client / server split + leak guard

Most frameworks expose client vars by **prefix** (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, …). Declare a
split and `@teispace/env` will (a) enforce the prefix at define time, and (b) **throw if you read a
server secret in client code** — so a secret can't leak into a browser bundle:

```ts
export const env = defineEnv({
  clientPrefix: 'NEXT_PUBLIC_',
  server: { DATABASE_URL: e.url(), STRIPE_SECRET: e.string({ min: 1 }).secret() },
  client: { NEXT_PUBLIC_API_URL: e.url() },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    STRIPE_SECRET: process.env.STRIPE_SECRET,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
});

env.NEXT_PUBLIC_API_URL; // ok everywhere
env.STRIPE_SECRET; // ❌ throws if read on the client
```

> **Why `runtimeEnv`?** Bundlers (Vite, Next) **statically replace** `import.meta.env.X` /
> `process.env.X` at build time and only when the key is a literal. A dynamic lookup can't be
> inlined, so client values must be listed explicitly. On the server we auto-read `process.env`, so
> `runtimeEnv` is optional there.

### 4. `.env` loading

`@teispace/env/load` loads the standard cascade (`.env` → `.env.local` → `.env.[mode]` →
`.env.[mode].local`) with `${VAR}` expansion — a drop-in superset of `dotenv`:

```ts
import { loadEnv } from '@teispace/env/load';
loadEnv(); // populates process.env, returns the merged values

// or, like `import 'dotenv/config'`:
import '@teispace/env/config';
```

---

## Framework presets

Each preset bakes in the right `clientPrefix` and re-exports `e`:

```ts
import { defineEnv, e } from '@teispace/env/next'; //  NEXT_PUBLIC_
import { defineEnv, e } from '@teispace/env/vite'; //  VITE_       (reads import.meta.env)
import { defineEnv, e } from '@teispace/env/nuxt'; //  NUXT_PUBLIC_
import { defineEnv, e } from '@teispace/env/astro'; // PUBLIC_     (reads import.meta.env)
import { defineEnv, e } from '@teispace/env/sveltekit'; // PUBLIC_
import { defineEnv, e } from '@teispace/env/node'; //  flat + optional .env loading
```

### NestJS / Express / Fastify / Hono (backend)

```ts
import { defineEnv, e } from '@teispace/env/node';

export const env = defineEnv({
  load: true, // load .env cascade first
  schema: {
    NODE_ENV: e.enum(['development', 'production', 'test']).default('development'),
    PORT: e.port().default(3000),
    DATABASE_URL: e.url(),
  },
});

// NestJS:
// ConfigModule.forRoot({ validate: () => env, isGlobal: true });
```

### Cloudflare Workers (no global `process.env`)

Workers pass bindings into the handler, so build a parser with `createEnv` and call it per request:

```ts
import { createEnv, e } from '@teispace/env';

const parseEnv = createEnv({ schema: { API_KEY: e.string({ min: 1 }).secret() } });

export default {
  fetch(req: Request, env: unknown) {
    const config = parseEnv(env); // typed; validated once per binding
    return new Response(config.API_KEY ? 'ok' : 'no key');
  },
};
```

---

## Ergonomics

### `devDefault` / `testDefault` — keep production honest

A plain `.default()` on something like `DATABASE_URL` means a misconfigured
production deploy silently boots against localhost instead of failing loudly.
`.devDefault()` gives you the convenient local value while leaving the variable
**strictly required in production**.

```ts
export const env = defineEnv({
  schema: {
    // Required in production; localhost everywhere else.
    DATABASE_URL: e.url().devDefault('postgres://localhost:5432/dev'),
    // Deterministic under `NODE_ENV=test`, regardless of the dev value.
    STRIPE_KEY: e.string().devDefault('sk_test_local').testDefault('sk_test_fixture'),
  },
});
```

Precedence, most specific first: `testDefault` → `devDefault` → `default`. An
explicitly-set variable always wins over all three.

### `refine` — constraints that span variables

Per-variable `.refine()` cannot express "`SMTP_PASS` is required when
`SMTP_HOST` is set". Object-level `refine` runs after every variable is coerced
and folds failures into the same aggregated report:

```ts
export const env = defineEnv({
  schema: {
    SMTP_HOST: e.hostname().optional(),
    SMTP_PASS: e.string().secret().optional(),
  },
  refine: (env) =>
    env.SMTP_HOST && !env.SMTP_PASS ? 'SMTP_PASS is required when SMTP_HOST is set' : true,
});
```

It is skipped when per-variable validation already failed, so a cross-field rule
never buries the real root cause under a cascade.

### `runtimeEnvStrict` — catch the forgotten mapping at build time

Bundlers inline env access **statically**: Next replaces literal
`process.env.NEXT_PUBLIC_X`, Vite replaces `import.meta.env.VITE_X`. Declare a
client variable in the schema but forget its line in `runtimeEnv`, and it is
simply absent in the browser — discovered in production, not at build.

`runtimeEnvStrict` turns that into a startup error naming the exact keys. It is
**on by default in the `next` and `vite` presets**, where the mapping is
mandatory anyway.

```ts
export const env = defineEnv({
  server: { DATABASE_URL: e.url() },     // never needs a mapping — server-only
  client: { NEXT_PUBLIC_API_URL: e.url() },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, // required
  },
});
```

Only `client` and `shared` require mappings — and this is not just a relaxed
check, it is how values resolve. When you supply `runtimeEnv`, client and shared
variables read **strictly** from it (the bundler contract: a dynamic fallback
would produce values in dev that vanish in a production build), while server
variables fall back to the live `process.env` for any key you did not list.

So you enumerate the client and let the server resolve itself. This mirrors what
`@t3-oss/env-nextjs` settled on with `experimental__runtimeEnv`, and it means a
server variable never has to be written out — which matters, because listing it
hands the bundler the very name we work to keep off the client.

An explicit `runtimeEnv` entry always wins over `process.env`, so you can still
pin a server value when you want to.

### `.env` cascade order

Vite and Next resolve `.env` files in **different** orders — `.env.local` and
`.env.[mode]` are swapped:

| Order | Precedence (lowest → highest) |
|---|---|
| `vite` (default) | `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local` |
| `next` | `.env` → `.env.[mode]` → `.env.local` → `.env.[mode].local` |
| `bun` | same as `next` |

```ts
loadEnv({ order: 'next' });
```

If you have both a `.env.local` and a `.env.production`, this changes which
value wins. `.env.local` is always skipped under `NODE_ENV=test` so CI and local
runs agree.

## Configuration guards

These are **config-time** assertions: they fail at import, with a message naming
the offending key, rather than letting a mistake become a runtime surprise.

### Server variables may not carry the client prefix

```ts
defineEnv({
  server: { NEXT_PUBLIC_STRIPE_SECRET: e.string() },  // ❌ throws
  clientPrefix: 'NEXT_PUBLIC_',
});
```

Bundlers inline by **name**, not by which group you filed a variable under.
Next replaces every literal `process.env.NEXT_PUBLIC_*` and Vite every
`import.meta.env.VITE_*`, so a prefixed variable is shipped to the browser no
matter what — and the server/client leak guard cannot protect it, because from
the bundler's point of view it was never a server variable. Declaring it under
`server` bought a false sense of safety, so the configuration is refused.

Rename it without the prefix to keep it server-only, or move it to
`client`/`shared` if it is genuinely safe to expose. `shared` variables **may**
carry the prefix — being public in both contexts is exactly what the prefix
advertises.

### A variable may only appear in one group

```ts
defineEnv({
  server: { NODE_ENV: e.string() },
  shared: { NODE_ENV: e.string() },   // ❌ throws
});
```

Beyond being ambiguous (which group's validator wins?), this used to crash the
client leak guard: the value was written onto the frozen result by the `shared`
group while the key was also listed as server-only, so the Proxy's `ownKeys`
trap hid an own property of a non-extensible object. That violates a JavaScript
Proxy invariant, and `Object.keys(env)`, `{ ...env }` and `JSON.stringify(env)`
all threw `TypeError` on the client.

Pick the group with the widest correct visibility — `shared` when both sides
need it, `server` when only the server does.

### Empty strings

By default an empty string is treated as **absent**, so `.default()` and
`.optional()` apply. Shells, CI runners and Docker frequently surface an unset
variable as `''`, and "set to empty" almost never means the operator chose the
empty string.

```ts
defineEnv({
  schema: { PORT: e.port().default(3000) },
  runtimeEnv: { PORT: '' },
});                                        // → PORT = 3000
```

Set `emptyStringAsUndefined: false` to treat `''` as a real, present value that
must pass validation:

```ts
defineEnv({
  schema: { PORT: e.port().default(3000) },
  runtimeEnv: { PORT: '' },
  emptyStringAsUndefined: false,
});                                        // → throws: not a valid port
```

Note `e.string()` enforces a **non-empty** string, matching its documented
contract. Pass an explicit `min` (including `min: 0`) to allow `''`.

## Upgrading from 0.2.x

Everything below is a case that was previously accepted but wrong. If your
config was correct, nothing changes.

### Behaviour changes

**1. `emptyStringAsUndefined: false` now works.**
It was documented but was a no-op for every built-in coercer — `Coercer.validate`
unconditionally treated `''` as absent and overrode the flag. If you set it and
adapted to the old (broken) result, an empty value now correctly reaches the
validator and can fail. That is the documented behaviour.

**2. `e.string()` rejects the empty string.**
Its docstring always said "a non-empty string"; the check simply never ran,
because `''` could not reach the parser until fix #1. Pass `min: 0` to allow it:

```diff
- ALLOW_EMPTY: e.string()
+ ALLOW_EMPTY: e.string({ min: 0 })
```

**3. Server variables carrying the client prefix are now rejected.**
See [Configuration guards](#configuration-guards). A config like
`server: { NEXT_PUBLIC_SECRET: ... }` used to be accepted while the value was
shipped to the browser anyway. Rename the variable, or move it to
`client`/`shared` if exposure is intended.

**4. A variable declared in two groups is now rejected.**
Previously accepted, then threw `TypeError` from `Object.keys`/spread/
`JSON.stringify` on the client. Keep one declaration.

**5. `runtimeEnvStrict` defaults to ON in the `next` and `vite` presets.**
Those presets require an explicit `runtimeEnv` mapping anyway; now a missing
entry is a startup error naming the key instead of a variable that is silently
`undefined` in the browser. Only `client` and `shared` need mappings — never
`server`. Set `runtimeEnvStrict: false` to opt out.

**6. Secret redaction no longer corrupts messages.**
The blanket literal scrub is skipped for values under 6 characters, which had
been rewriting the *expectation*: `e.int({ min: 10 })` receiving `"1"` reported
`Expected a number >= ***0`. Redaction of real secrets is unchanged — every
coercer quotes the value it echoes, and quoted fragments are always redacted.

**7. Non-`Promise` thenables now throw instead of vanishing.**
A Standard Schema returning a cross-realm or polyfilled thenable was read as a
successful `undefined` and the variable disappeared from the result with **no
error**. It now raises the same "async validation is not supported" error a
native promise does.

### Packaging

- **`engines` lowered to `>=20.9.0`** (was `>=24`), and the README's "Node ≥ 22.12
  / ESM-only" line was wrong on both counts — the package ships dual ESM + CJS.
- **`sideEffects` is now `["./dist/config.js", "./dist/config.cjs"]`** instead of
  `false`. `@teispace/env/config` exports nothing and exists purely for its side
  effect, so `false` permitted bundlers to delete
  `import '@teispace/env/config'` outright and silently skip the entire `.env`
  cascade.

### New, purely additive

`devDefault` / `testDefault`, object-level `refine`, `runtimeEnvStrict`, and a
selectable `.env` cascade `order` (`'vite' | 'next' | 'bun'`) — see
[Ergonomics](#ergonomics). Cloudflare Workers detection was corrected for
`nodejs_compat` being on by default since August 2026.

---

## Robustness

- **Aggregated errors** — every problem reported at once, with the offending value (secrets
  redacted), not first-error-only.
- **`skipValidation`** for CI/Docker build steps — still applies defaults & coercion (so the typed
  shape holds), only skips throwing.
- **Parse once** — validation runs at module evaluation; reads are plain property access.
- **Frozen output** — the result is `Object.freeze`d; it's the single source of truth.
- **Never crashes on import** — runtime detection is fully defensive across Node/Bun/Deno/Workers/
  browser.
- **Zero dependencies** — and, unlike `@t3-oss/env-*`, no validator peer dependency either: the built-in `e.*` coercers work standalone, and Zod/Valibot/ArkType are optional. Dual ESM + CJS, tree-shakeable, ships types.

---

## License

MIT © Teispace
