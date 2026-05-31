/**
 * Human-friendly, aggregated error formatting for `@teispace/env`.
 *
 * `defineEnv`/`createEnv` collect **every** failing variable into an
 * `EnvIssue[]` and hand them here to build the single grouped report that
 * gets attached to an {@link EnvValidationError}. The format is intentionally
 * scannable — one bullet per variable, the received value (redacted for
 * secrets), and the validator's expectation — because a developer staring at
 * a failed boot wants the whole list at once, not a first-error-only trace.
 *
 * Two robustness rules drive this module:
 *
 * 1. **Never print a secret.** A value is redacted to `"***"` when its
 *    validator declares `meta.secret`, or when the variable *name* matches the
 *    secret heuristic (`/KEY|SECRET|TOKEN|PASSWORD|PRIVATE/i`). An explicit
 *    `meta.secret === false` always wins, so a var named `PUBLIC_API_KEY` can
 *    opt out. This keeps secrets out of CI logs, terminals, and crash reports.
 *
 * 2. **Zero dependencies, never crash.** We want colorized output like
 *    `picocolors` gives, but env ships with no runtime deps, so color is a
 *    handful of inline ANSI helpers gated on TTY + `NO_COLOR`. Every probe is
 *    wrapped so a weird runtime (Workers, Deno, a mocked `process`) can never
 *    turn formatting an error into a *second*, more confusing error.
 */

import type { EnvIssue } from './types.js';

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

/**
 * Variable-name heuristic for secrets. Matched case-insensitively against the
 * key so `DATABASE_PASSWORD`, `STRIPE_SECRET`, `JWT_TOKEN`, `API_KEY`, and
 * `PRIVATE_KEY` are all redacted by default — even if the schema author forgot
 * to set `meta.secret`. Deliberately conservative: it errs toward hiding a
 * value rather than leaking one.
 */
const SECRET_NAME_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|PRIVATE/i;

/** The string shown in place of a redacted value. */
const REDACTED = '***';

/**
 * Decide whether a variable's received value must be redacted.
 *
 * Precedence (most specific wins):
 *   1. An explicit `secret` flag from the validator's `meta` (true *or* false).
 *      `false` is an intentional opt-out for a public var with a scary name.
 *   2. Otherwise the name heuristic.
 */
export function isSecretKey(key: string, explicitSecret?: boolean): boolean {
  if (typeof explicitSecret === 'boolean') return explicitSecret;
  return SECRET_NAME_PATTERN.test(key);
}

/**
 * Render the "received X" fragment for one issue, redacting secrets and making
 * absent/empty values legible. We never interpolate a raw secret value here —
 * redaction happens *before* the value is ever placed into a string.
 */
function renderReceived(received: string | undefined, redact: boolean): string {
  if (received === undefined) return 'received nothing (missing)';
  if (redact) return `received "${REDACTED}"`;
  if (received === '') return 'received an empty string';
  return `received "${received}"`;
}

/**
 * Matches a `received "<json-string-body>"` fragment that a coercer may have
 * inlined (e.g. `received "99999"`). The body is a JSON string allowing escaped
 * quotes, so values containing `"` are still fully captured. Used to redact ANY
 * inlined received value for a secret — including per-element values from
 * `e.array({ of: ... })`, whose element strings are NOT equal to the variable's
 * top-level `received` and so would otherwise survive a literal scrub.
 */
const RECEIVED_FRAGMENT_RE = /received "(?:[^"\\]|\\.)*"/g;

/**
 * Belt-and-suspenders secret scrubbing. A validator's message *should* be
 * value-light, but some built-in coercers embed the offending value (e.g.
 * `port()` → `received "99999"`, or an array's per-element `[1] ... received
 * "<elem>"`). If the variable is a secret we therefore (a) blanket-redact every
 * `received "…"` fragment, and (b) additionally scrub any literal occurrence of
 * the top-level received value — both bare and JSON-quoted — so a secret can
 * never leak through a validator's own wording. Returns the message unchanged
 * for non-secrets.
 */
function scrubSecretFromMessage(message: string, received: string, redact: boolean): string {
  if (!redact) return message;
  // (a) Redact any inlined `received "…"` fragment regardless of which value it
  // holds (top-level, array element, or a nested coercer's own wording).
  let out = message.replaceAll(RECEIVED_FRAGMENT_RE, `received "${REDACTED}"`);
  // (b) Belt-and-suspenders for any other literal occurrence of the raw value.
  if (received !== '') {
    const quoted = JSON.stringify(received); // e.g. "s3cr3t" with quotes
    out = out.replaceAll(quoted, `"${REDACTED}"`).replaceAll(received, REDACTED);
  }
  return out;
}

/** True when the message already states what was received (avoid a duplicate clause). */
function mentionsReceived(message: string): boolean {
  return /received|missing/i.test(message);
}

// ---------------------------------------------------------------------------
// Color — tiny, dependency-free, defensive
// ---------------------------------------------------------------------------

/**
 * Whether ANSI color should be emitted. Honors the `NO_COLOR` convention
 * (https://no-color.org), `FORCE_COLOR`, and otherwise requires stderr to be a
 * TTY. All access to `process` is guarded because env runs on runtimes where
 * `process` may be absent (browser bundles, Workers) or partial.
 */
function colorEnabled(): boolean {
  try {
    const proc = (globalThis as { process?: NodeJS.Process }).process;
    if (!proc?.env) return false;
    if (proc.env.NO_COLOR) return false;
    if (proc.env.FORCE_COLOR) return true;
    // stderr is where we print boot failures; a piped/redirected stream is not
    // a TTY and should stay plain so logs/CI artifacts aren't littered with
    // escape codes.
    const stderr = proc.stderr as { isTTY?: boolean } | undefined;
    return Boolean(stderr?.isTTY);
  } catch {
    return false;
  }
}

/** Wrap `text` in an ANSI SGR pair when color is enabled; otherwise pass through. */
function wrap(open: number, close: number, text: string, enabled: boolean): string {
  if (!enabled) return text;
  return `[${open}m${text}[${close}m`;
}

const paint = {
  red: (s: string, on: boolean) => wrap(31, 39, s, on),
  yellow: (s: string, on: boolean) => wrap(33, 39, s, on),
  bold: (s: string, on: boolean) => wrap(1, 22, s, on),
  dim: (s: string, on: boolean) => wrap(2, 22, s, on),
};

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/** Per-key extra context the formatter needs but `EnvIssue` doesn't carry. */
export interface FormatEnvErrorsOptions {
  /**
   * Map of variable name → explicit `meta.secret` flag from its validator.
   * Absent entries fall back to the name heuristic. Lets a non-obviously-named
   * secret be redacted and an obviously-named public var opt out.
   */
  readonly secretFlags?: Readonly<Record<string, boolean | undefined>>;
  /** Force color on/off (mainly for tests); defaults to runtime detection. */
  readonly color?: boolean;
}

/**
 * Build the aggregated, redacted, optionally-colorized report for a set of
 * failing env vars. This is the real implementation behind
 * `EnvValidationError.format`; `defineEnv` passes the result as the error's
 * message so the class in `types.ts` stays a dumb data holder.
 *
 * Example output:
 *
 * ```text
 * ❌ Invalid environment variables:
 *
 *   • DATABASE_URL: Expected a valid URL, received "not-a-url"
 *   • PORT: Expected a port (1-65535), received "99999"
 *   • API_KEY: Required, but missing
 *
 * Fix these variables and restart.
 * ```
 */
export function formatEnvErrors(
  issues: ReadonlyArray<EnvIssue>,
  options: FormatEnvErrorsOptions = {},
): string {
  const on = options.color ?? colorEnabled();
  const secretFlags = options.secretFlags ?? {};

  const header = paint.bold(paint.red('❌ Invalid environment variables:', on), on);

  const lines = issues.map((issue) => {
    const redact = isSecretKey(issue.key, secretFlags[issue.key]);
    // Join multiple refinement messages (e.g. min + regex) with "; " so each
    // variable stays on a single, scannable bullet line.
    const joined = issue.messages.length > 0 ? issue.messages.join('; ') : 'Invalid value';
    // Scrub any secret value the validator may have inlined, THEN decide whether
    // to append our own received clause.
    const detail = scrubSecretFromMessage(joined, issue.received ?? '', redact);
    // For secrets we want a visible "received \"***\"" signal that a value
    // existed but was hidden — even when the validator's own message was
    // value-light (e.g. "received length 16"). We skip the append only when the
    // scrubbed message ALREADY carries that exact redacted marker, so a secret
    // line never duplicates `received "***"`. For non-secrets we append only
    // when the message doesn't already state what was received.
    const alreadyRedactedClause = detail.includes(`received "${REDACTED}"`);
    const body = (redact ? alreadyRedactedClause : mentionsReceived(detail))
      ? detail
      : `${detail}, ${renderReceived(issue.received, redact)}`;
    const name = paint.yellow(issue.key, on);
    return `  ${paint.dim('•', on)} ${name}: ${body}`;
  });

  const footer = paint.dim('Fix these variables and restart.', on);

  return `${header}\n\n${lines.join('\n')}\n\n${footer}`;
}
