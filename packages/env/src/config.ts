/**
 * Side-effecting entry: `import '@teispace/env/config'` — a drop-in superset of
 * `import 'dotenv/config'`. Where dotenv only loads a single `.env`, this runs
 * the full Vite/Next-style cascade (`.env` → `.env.local` → `.env.[mode]` →
 * `.env.[mode].local`) WITH `${VAR}` expansion, then populates `process.env`.
 *
 * Deliberately tiny and exports nothing meaningful — its value is the side
 * effect. `loadEnv` is itself a guarded no-op off Node/Bun/Deno, so importing
 * this from a browser/Workers bundle is harmless. The outer try/catch is belt-
 * and-suspenders: a side-effect import must NEVER throw during module load.
 */

import { loadEnv } from './load.js';

try {
  loadEnv();
} catch (_e) {
  // loadEnv is already internally defensive; swallow anything that escapes so a
  // bare `import '@teispace/env/config'` can never crash a consumer's startup.
}
