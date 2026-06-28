import { describe, expect, it } from 'vitest';
import { stripSaveAuthTokens } from '../../../../src/services/setup/http-client/injectors';

/**
 * The template's `src/lib/config/constants.ts` ships SAVE_AUTH_TOKENS in two
 * historical shapes:
 *   1) legacy plain literal — `export const SAVE_AUTH_TOKENS = false;`
 *   2) computed form — JSDoc + `const BEARER_ALLOWED_ENVS = new Set([...])` +
 *      `export const SAVE_AUTH_TOKENS = BEARER_ALLOWED_ENVS.has(env.NODE_ENV);`
 *
 * `stripSaveAuthTokens` must remove the full unit in both shapes, leaving no
 * orphaned `BEARER_ALLOWED_ENVS` const (which would be an unused-var lint
 * error). These tests lock that contract in.
 */
describe('stripSaveAuthTokens', () => {
  it('removes the legacy plain-literal form', () => {
    const input = [
      "export const API_PREFIX = '/api/v1';",
      "export const API_RESPONSE_DATA_KEY = 'data';",
      'export const SAVE_AUTH_TOKENS = false;',
      '',
    ].join('\n');

    const out = stripSaveAuthTokens(input);

    expect(out).not.toContain('SAVE_AUTH_TOKENS');
    expect(out).toContain("export const API_PREFIX = '/api/v1';");
    expect(out).toContain('API_RESPONSE_DATA_KEY');
  });

  it('removes the computed form together with BEARER_ALLOWED_ENVS and its JSDoc', () => {
    const input = `import { Environment } from '../enums';
import { env } from '../env';

export const API_RESPONSE_DATA_KEY = 'data';

export const isProduction = env.NODE_ENV === Environment.PRODUCTION;
export const isDevelopment = env.NODE_ENV === Environment.DEVELOPMENT;
export const isTest = env.NODE_ENV === Environment.TEST;

/**
 * Auth-token storage mode, derived from NODE_ENV.
 *
 * The gate is a positive allowlist of exactly {development, test}.
 */
const BEARER_ALLOWED_ENVS = new Set<string>([Environment.DEVELOPMENT, Environment.TEST]);
export const SAVE_AUTH_TOKENS = BEARER_ALLOWED_ENVS.has(env.NODE_ENV);
`;

    const out = stripSaveAuthTokens(input);

    expect(out).not.toContain('SAVE_AUTH_TOKENS');
    expect(out).not.toContain('BEARER_ALLOWED_ENVS');
    expect(out).not.toMatch(/Auth-token storage mode/);
    // Unrelated declarations + the imports that back them must survive.
    expect(out).toContain('export const isProduction');
    expect(out).toContain("import { env } from '../env';");
    expect(out).toContain("import { Environment } from '../enums';");
  });

  it('is a no-op when SAVE_AUTH_TOKENS is absent', () => {
    const input = "export const API_PREFIX = '/api/v1';\n";
    expect(stripSaveAuthTokens(input)).toBe(input);
  });

  it('does not remove the isProduction JSDoc-free block by accident', () => {
    // A JSDoc that does NOT mention SAVE_AUTH_TOKENS must be preserved.
    const input = `/**
 * URI version prefix mounted by the API.
 */
export const API_PREFIX = '/api/v1';
export const SAVE_AUTH_TOKENS = false;
`;
    const out = stripSaveAuthTokens(input);
    expect(out).toContain('URI version prefix mounted by the API');
    expect(out).toContain('API_PREFIX');
    expect(out).not.toContain('SAVE_AUTH_TOKENS');
  });
});
