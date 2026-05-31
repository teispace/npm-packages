/**
 * The `.env` cascade loader for `@teispace/env` — a zero-dependency superset of
 * `dotenv`'s loader with Vite/Next-style file precedence and `${VAR}`
 * expansion. Node/Bun/Deno only; a guarded no-op everywhere else.
 *
 * Per RESEARCH §7, this is server/runtime-only: bundlers static-replace env
 * access in client code, and Workers have no filesystem. We therefore reach for
 * `node:fs`/`node:path` behind try/catch and degrade to `{}` rather than crash
 * a consumer who happens to import this from a browser bundle. We write our OWN
 * parser (no `dotenv`) so the package stays dependency-free.
 */

import { detectCwd, detectRawEnv } from './runtime.js';
import type { RawEnv } from './types.js';

export interface LoadEnvOptions {
  /** Base directory the cascade is resolved against. Default: `process.cwd()` (or `'.'`). */
  cwd?: string;
  /**
   * Deployment mode (`development` / `production` / `test`). Selects the
   * `.env.[mode]` files. Default: `process.env.NODE_ENV`.
   */
  mode?: string;
  /**
   * Explicit list of files (relative to `cwd` or absolute) to load, highest
   * precedence LAST. Overrides the computed cascade entirely.
   */
  files?: string[];
  /**
   * Expand `${VAR}` / `$VAR` references using already-loaded values + the
   * target env. Supports `${VAR:-default}` and the `\$` literal escape.
   * Default: `true`.
   */
  expand?: boolean;
  /**
   * Whether loaded values overwrite keys that already exist in the target env.
   * Matches dotenv's default (do NOT override). Default: `false`.
   */
  override?: boolean;
  /**
   * The target bag to read existing values from and write resolved values into
   * (so downstream `process.env.X` works). Default: the detected runtime env
   * (`process.env`). Pass `{}` to parse without mutating the process.
   */
  processEnv?: RawEnv;
}

/** Minimal `node:fs` surface we need, resolved lazily + defensively. */
interface FsLike {
  readFileSync: (path: string, encoding: 'utf8') => string;
  existsSync: (path: string) => boolean;
}
/** Minimal `node:path` surface; on Deno/odd hosts we fall back to manual join. */
interface PathLike {
  resolve: (...parts: string[]) => string;
  isAbsolute: (p: string) => boolean;
  join: (...parts: string[]) => string;
}

/**
 * Lazily and defensively require a Node builtin. We avoid a static `import`
 * because this module is bundled for client targets too; a static
 * `import 'node:fs'` would make the browser build fail to resolve. The
 * indirected `require` is invisible to bundler static analysis and wrapped in
 * try/catch, so a missing builtin yields `undefined` instead of throwing.
 */
function loadBuiltin<T>(name: 'node:fs' | 'node:path'): T | undefined {
  try {
    const req = (
      globalThis as {
        require?: (id: string) => unknown;
        process?: { getBuiltinModule?: (id: string) => unknown };
      }
    ).require;
    // Node 22+ exposes a synchronous builtin getter that sidesteps CJS/ESM
    // interop entirely — prefer it when present.
    const getBuiltin = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } })
      .process?.getBuiltinModule;
    if (typeof getBuiltin === 'function') {
      const mod = getBuiltin(name);
      if (mod) return mod as T;
    }
    if (typeof req === 'function') {
      return req(name) as T;
    }
  } catch (_e) {
    // fall through to undefined
  }
  return undefined;
}

const NEWLINE_RE = /\r\n|\n|\r/;

/**
 * Parse a single `.env` document into a flat record. Supports, per the brief:
 * `KEY=value`, optional `export ` prefix, single/double/back-tick quoting,
 * multiline double-quoted values, `#` comments (ignored inside quotes),
 * `=` inside values, trailing-whitespace trim (preserved inside quotes), and
 * `\n`/`\t`/`\r`/`\\` escape expansion inside DOUBLE quotes only. Unknown lines
 * are skipped rather than throwing — a malformed `.env` must never crash load.
 */
export function parseEnv(src: string): RawEnv {
  const out: RawEnv = {};
  if (typeof src !== 'string' || src.length === 0) return out;

  const lines = src.split(NEWLINE_RE);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Strip a leading BOM on the first line.
    if (i === 0 && line.charCodeAt(0) === 0xfeff) line = line.slice(1);

    const trimmedStart = line.replace(/^\s+/, '');
    // Skip blank lines and whole-line comments.
    if (trimmedStart === '' || trimmedStart.startsWith('#')) continue;

    // Allow an optional `export ` (dotenv/shell compatibility).
    const withoutExport = trimmedStart.replace(/^export\s+/, '');

    // Split on the FIRST `=` so values may themselves contain `=`.
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue; // not a KEY=VALUE line; ignore defensively.

    const key = withoutExport.slice(0, eq).trim();
    if (key === '' || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) continue;

    let rest = withoutExport.slice(eq + 1);
    // Drop a single leading space after `=` (KEY= value), then inspect quoting.
    rest = rest.replace(/^[ \t]+/, '');

    const first = rest[0];
    if (first === '"' || first === "'" || first === '`') {
      // Quoted value — may span multiple physical lines for any quote char.
      const quote = first;
      let body = rest.slice(1);
      let closed = false;
      // Try to close on the same line, respecting `\"` escapes for "..." only.
      const closeIdx = findClosingQuote(body, quote);
      if (closeIdx !== -1) {
        body = body.slice(0, closeIdx);
        closed = true;
      } else {
        // Accumulate following lines until we find the closing quote.
        const buf: string[] = [body];
        while (++i < lines.length) {
          const next = lines[i];
          const idx = findClosingQuote(next, quote);
          if (idx !== -1) {
            buf.push(next.slice(0, idx));
            closed = true;
            break;
          }
          buf.push(next);
        }
        body = buf.join('\n');
      }
      // If never closed, treat the accumulated text as the value (lenient).
      void closed;
      out[key] = quote === '"' ? expandDoubleQuoteEscapes(body) : body;
    } else {
      // Unquoted: strip an inline `# comment` and trailing whitespace.
      let value = rest;
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash);
      else if (value.startsWith('#')) value = '';
      out[key] = value.replace(/\s+$/, '');
    }
  }

  return out;
}

/**
 * Find the index of the closing quote in `s`, honoring backslash escapes for
 * double quotes only (`\"`). Single/back-tick quotes are literal in `.env`, so
 * the first occurrence closes them. Returns -1 when no closer is on this slice.
 */
function findClosingQuote(s: string, quote: string): number {
  if (quote !== '"') return s.indexOf(quote);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++; // skip the escaped char
      continue;
    }
    if (s[i] === quote) return i;
  }
  return -1;
}

/** Expand `\n` `\r` `\t` `\\` and `\"` inside a double-quoted value body. */
function expandDoubleQuoteEscapes(body: string): string {
  return body.replace(/\\([nrt"\\])/g, (_m, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '"':
        return '"';
      case '\\':
        return '\\';
      default:
        return ch;
    }
  });
}

// Match `\$` (escape), `${VAR}` / `${VAR:-default}`, or bare `$VAR`.
const EXPAND_RE = /\\\$|\$\{([^}]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Resolve `${VAR}` / `$VAR` references in `value` against `lookup`. Supports
 * `${VAR:-default}` (use default when VAR is unset/empty) and `\$` to emit a
 * literal `$`. Unknown references resolve to empty string (POSIX-like).
 * Resolution is single-pass over `lookup`, which the caller seeds so that
 * earlier files and the target env are visible to later expansions.
 */
function expandValue(value: string, lookup: RawEnv): string {
  return value.replace(EXPAND_RE, (match, braced?: string, bare?: string) => {
    if (match === '\\$') return '$';
    if (typeof braced === 'string') {
      const dflt = braced.indexOf(':-');
      if (dflt !== -1) {
        const name = braced.slice(0, dflt);
        const fallback = braced.slice(dflt + 2);
        const v = lookup[name];
        return v === undefined || v === '' ? fallback : v;
      }
      return lookup[braced] ?? '';
    }
    if (typeof bare === 'string') {
      return lookup[bare] ?? '';
    }
    return match;
  });
}

/**
 * Compute the `.env` cascade for a mode, LOWEST precedence first. Mirrors
 * Vite/Next: `.env` < `.env.local` < `.env.[mode]` < `.env.[mode].local`.
 *
 * CONTRACT-NOTE: when `mode === 'test'` we intentionally SKIP `.env.local`.
 * This is a Vite convention — local overrides are developer-machine state and
 * would make test runs non-deterministic across machines/CI, so test mode
 * reads only the committed `.env`, `.env.test`, and `.env.test.local`.
 */
export function resolveCascade(mode: string | undefined): string[] {
  const files = ['.env'];
  if (mode !== 'test') files.push('.env.local');
  if (mode) {
    files.push(`.env.${mode}`);
    files.push(`.env.${mode}.local`);
  }
  return files;
}

/** Resolve a possibly-relative file path against `cwd`, with/without node:path. */
function resolvePath(path: PathLike | undefined, cwd: string, file: string): string {
  if (path) {
    return path.isAbsolute(file) ? file : path.resolve(cwd, file);
  }
  // Manual fallback (Deno without node:path, or odd hosts).
  if (/^([a-zA-Z]:[\\/]|[\\/])/.test(file)) return file;
  return `${cwd.replace(/[\\/]+$/, '')}/${file}`;
}

/**
 * Load the `.env` cascade and return the merged, expanded values. By default
 * also assigns any keys MISSING from the target env into it (so downstream
 * `process.env.X` reads work), honoring `override`.
 *
 * Safe no-op off Node/Bun/Deno: if `node:fs` is unavailable (browser/Workers),
 * returns `{}` without touching anything. NEVER throws — a missing file, a read
 * error, or an absent filesystem all degrade gracefully.
 */
export function loadEnv(options: LoadEnvOptions = {}): RawEnv {
  const fs = loadBuiltin<FsLike>('node:fs');
  const path = loadBuiltin<PathLike>('node:path');

  // No filesystem → guaranteed no-op (browser / Workers / sandbox).
  if (!fs || typeof fs.readFileSync !== 'function') return {};

  const target: RawEnv = options.processEnv ?? detectRawEnv();
  const cwd = options.cwd ?? detectCwd();
  const mode = options.mode ?? target.NODE_ENV ?? undefined;
  const expand = options.expand ?? true;
  const override = options.override ?? false;

  const files = options.files ?? resolveCascade(mode);

  // Merged values from the files only (lowest precedence first → later wins).
  const merged: RawEnv = {};

  for (const file of files) {
    let resolved: string;
    try {
      resolved = resolvePath(path, cwd, file);
    } catch (_e) {
      continue;
    }
    let contents: string;
    try {
      // Prefer existsSync to avoid noisy ENOENT, but tolerate its absence.
      if (typeof fs.existsSync === 'function' && !fs.existsSync(resolved)) continue;
      contents = fs.readFileSync(resolved, 'utf8');
    } catch (_e) {
      // Missing/unreadable file → skip silently (cascade files are optional).
      continue;
    }

    let parsed: RawEnv;
    try {
      parsed = parseEnv(contents);
    } catch (_e) {
      continue;
    }

    for (const key in parsed) {
      let value = parsed[key];
      if (expand && typeof value === 'string') {
        // Seed lookup with earlier-file values layered over the target env, so
        // expansions can reference both prior files and pre-existing env.
        value = expandValue(value, { ...target, ...merged });
      }
      merged[key] = value;
    }
  }

  // Assign into the target env (so `process.env.X` works), honoring override.
  try {
    for (const key in merged) {
      const has = Object.hasOwn(target, key) && target[key] !== undefined;
      if (override || !has) {
        target[key] = merged[key];
      }
    }
  } catch (_e) {
    // A frozen/exotic target must not crash the loader; return values anyway.
  }

  return merged;
}
