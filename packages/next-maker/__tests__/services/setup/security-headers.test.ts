import { describe, expect, it } from 'vitest';
import {
  hasSecurityHeaders,
  injectSecurityHeaders,
  SECURITY_HEADERS,
} from '../../../src/services/setup/security-headers/headers';

const baseConfig = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;
`;

describe('injectSecurityHeaders', () => {
  it('injects the headers block into a fresh next.config.ts', () => {
    const result = injectSecurityHeaders(baseConfig);

    expect(result).toContain('headers: async () => {');
    for (const { key, value } of SECURITY_HEADERS) {
      expect(result).toContain(`{ key: '${key}', value: '${value}' },`);
    }
    expect(result).toContain("source: '/:path*'");
  });

  it('preserves pre-existing config keys', () => {
    const result = injectSecurityHeaders(baseConfig);
    expect(result).toContain('reactCompiler: true,');
    expect(result).toContain('export default nextConfig;');
  });

  it('is idempotent — second run is a no-op', () => {
    const once = injectSecurityHeaders(baseConfig);
    const twice = injectSecurityHeaders(once);
    expect(twice).toBe(once);
  });

  it('does not overwrite a user-defined headers block', () => {
    const userConfig = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  headers: async () => [{ source: '/', headers: [{ key: 'X-Custom', value: 'yes' }] }],
};

export default nextConfig;
`;
    const result = injectSecurityHeaders(userConfig);
    expect(result).toBe(userConfig);
    expect(result).not.toContain('Strict-Transport-Security');
  });

  it('throws when the canonical config block is missing', () => {
    const broken = `export default { reactCompiler: true };\n`;
    expect(() => injectSecurityHeaders(broken)).toThrow(/const nextConfig/);
  });

  it('inserts headers strictly inside the config object', () => {
    const result = injectSecurityHeaders(baseConfig);
    const configStart = result.indexOf('const nextConfig: NextConfig = {');
    const headersIndex = result.indexOf('headers: async');
    const closeIndex = result.indexOf('};', configStart);

    expect(headersIndex).toBeGreaterThan(configStart);
    expect(headersIndex).toBeLessThan(closeIndex);
  });
});

describe('hasSecurityHeaders', () => {
  it('returns true when a headers key is present', () => {
    expect(hasSecurityHeaders(`const nextConfig = {\n  headers: async () => [],\n};`)).toBe(true);
  });

  it('returns false when only string values mention "headers:"', () => {
    const decoy = `const nextConfig = {\n  hint: 'put your headers: here',\n};`;
    expect(hasSecurityHeaders(decoy)).toBe(false);
  });
});
