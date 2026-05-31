import { describe, expect, it } from 'vitest';
import { formatEnvErrors, isSecretKey } from '../src/errors.js';
import type { EnvIssue } from '../src/types.js';

// Color is forced off for every assertion so we compare plain text, not ANSI.
const NO_COLOR = { color: false } as const;

describe('isSecretKey', () => {
  it('redacts by name heuristic (KEY/SECRET/TOKEN/PASSWORD/PRIVATE)', () => {
    expect(isSecretKey('API_KEY')).toBe(true);
    expect(isSecretKey('STRIPE_SECRET')).toBe(true);
    expect(isSecretKey('JWT_TOKEN')).toBe(true);
    expect(isSecretKey('DB_PASSWORD')).toBe(true);
    expect(isSecretKey('PRIVATE_KEY')).toBe(true);
    expect(isSecretKey('lowercase_secret')).toBe(true);
  });

  it('does not redact ordinary names', () => {
    expect(isSecretKey('PORT')).toBe(false);
    expect(isSecretKey('DATABASE_URL')).toBe(false);
    expect(isSecretKey('NODE_ENV')).toBe(false);
  });

  it('lets an explicit meta.secret flag override the name heuristic', () => {
    // Scary name, explicitly public -> not redacted.
    expect(isSecretKey('PUBLIC_API_KEY', false)).toBe(false);
    // Innocent name, explicitly secret -> redacted.
    expect(isSecretKey('SEED', true)).toBe(true);
  });
});

describe('formatEnvErrors', () => {
  it('aggregates ALL issues into one scannable report', () => {
    const issues: EnvIssue[] = [
      {
        key: 'DATABASE_URL',
        received: 'not-a-url',
        messages: ['Expected a valid URL, received "not-a-url"'],
      },
      {
        key: 'PORT',
        received: '99999',
        messages: ['Expected a valid port (1-65535), received "99999"'],
      },
      { key: 'MISSING_VAR', received: undefined, messages: ['Required, but missing'] },
    ];
    const out = formatEnvErrors(issues, NO_COLOR);

    expect(out).toContain('Invalid environment variables');
    // Every variable appears.
    expect(out).toContain('DATABASE_URL');
    expect(out).toContain('PORT');
    expect(out).toContain('MISSING_VAR');
    // One bullet per issue.
    expect(out.match(/•/g)?.length).toBe(3);
    expect(out).toContain('Fix these variables and restart.');
  });

  it('does not duplicate the "received" clause when the message already has one', () => {
    const out = formatEnvErrors(
      [
        {
          key: 'PORT',
          received: '99999',
          messages: ['Expected a valid port (1-65535), received "99999"'],
        },
      ],
      NO_COLOR,
    );
    // "received" must appear exactly once for this line.
    expect(out.match(/received/g)?.length).toBe(1);
    expect(out).toContain('PORT: Expected a valid port (1-65535), received "99999"');
  });

  it('appends a received clause when the validator message omits it', () => {
    const out = formatEnvErrors(
      [{ key: 'COLOR', received: 'mauve', messages: ['Expected one of: red, green, blue'] }],
      NO_COLOR,
    );
    expect(out).toContain('COLOR: Expected one of: red, green, blue, received "mauve"');
  });

  it('shows a clear "missing" rendering for absent values', () => {
    const out = formatEnvErrors(
      [{ key: 'NEEDS_VALUE', received: undefined, messages: ['Some invalid'] }],
      NO_COLOR,
    );
    expect(out).toContain('received nothing (missing)');
  });

  it('redacts secret values by name heuristic, never printing them', () => {
    const out = formatEnvErrors(
      [{ key: 'API_KEY', received: 'sk_live_supersecret', messages: ['Invalid value'] }],
      NO_COLOR,
    );
    expect(out).not.toContain('sk_live_supersecret');
    expect(out).toContain('***');
  });

  it('redacts a secret value even when embedded in the validator message', () => {
    // A coercer that inlined the value should still not leak it for a secret key.
    const out = formatEnvErrors(
      [
        {
          key: 'SESSION_SECRET',
          received: 's3cr3t-token',
          messages: ['Expected a string matching /x/, received "s3cr3t-token"'],
        },
      ],
      NO_COLOR,
    );
    expect(out).not.toContain('s3cr3t-token');
    expect(out).toContain('***');
  });

  it('honors an explicit meta.secret=false to show a scary-named public var', () => {
    const out = formatEnvErrors(
      [{ key: 'PUBLIC_API_KEY', received: 'pk_visible', messages: ['Invalid value'] }],
      { color: false, secretFlags: { PUBLIC_API_KEY: false } },
    );
    expect(out).toContain('pk_visible');
    expect(out).not.toContain('***');
  });

  it('emits ANSI escape codes when color is forced on', () => {
    const out = formatEnvErrors([{ key: 'PORT', received: 'x', messages: ['bad'] }], {
      color: true,
    });
    // ESC[ marks an SGR sequence.
    expect(out).toContain('[');
  });

  it('emits no ANSI escape codes when color is off', () => {
    const out = formatEnvErrors([{ key: 'PORT', received: 'x', messages: ['bad'] }], NO_COLOR);
    expect(out).not.toContain('[');
  });
});
