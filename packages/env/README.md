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

Requires Node ≥ 22.12 (or Bun/Deno/Workers). ESM-only.

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

Chainable on every coercer (each narrows the type precisely):

```ts
e.string().optional(); //   string | undefined
e.port().default(3000); //  number  (default survives `skipValidation`)
e.string().min(1).secret(); // redacted in error output
e.number().refine((n) => n % 2 === 0, 'must be even');
e.string().transform((s) => s.toUpperCase());
e.url().describe('Public API base URL');
```

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
  server: { DATABASE_URL: e.url(), STRIPE_SECRET: e.string().min(1) },
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

const parseEnv = createEnv({ schema: { API_KEY: e.string().min(1) } });

export default {
  fetch(req: Request, env: unknown) {
    const config = parseEnv(env); // typed; validated once per binding
    return new Response(config.API_KEY ? 'ok' : 'no key');
  },
};
```

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
- **Zero dependencies**, ESM, fully tree-shakeable, ships types.

---

## License

MIT © Teispace
