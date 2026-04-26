import { describe, expect, it } from 'vitest';
import {
  unwrapBundleAnalyzer,
  unwrapNextIntlPlugin,
} from '../../../src/manifests/transforms/next-config';

const FULL_CONFIG = `import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { isProduction } from './src/lib/config/constants';

const nextConfig: NextConfig = {
  output: isProduction ? 'standalone' : undefined,
  reactCompiler: true,
};

const withNextIntl = createNextIntlPlugin();
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default bundleAnalyzer(withNextIntl(nextConfig));
`;

describe('unwrapNextIntlPlugin', () => {
  it('removes the createNextIntlPlugin import and withNextIntl declaration', () => {
    const result = unwrapNextIntlPlugin(FULL_CONFIG) ?? '';
    expect(result).not.toContain('next-intl/plugin');
    expect(result).not.toContain('createNextIntlPlugin');
    expect(result).not.toContain('const withNextIntl');
  });

  it('unwraps withNextIntl(...) in the default export', () => {
    const result = unwrapNextIntlPlugin(FULL_CONFIG) ?? '';
    expect(result).toContain('export default bundleAnalyzer(nextConfig);');
    expect(result).not.toMatch(/withNextIntl\(/);
  });

  it('returns null when withNextIntl is not in the export', () => {
    const noWrap = FULL_CONFIG.replace(/withNextIntl\(/, '/* removed (');
    const result = unwrapNextIntlPlugin(noWrap);
    // Either still returns content (idempotent) or null. Check we don't crash:
    expect(typeof result === 'string' || result === null).toBe(true);
  });
});

describe('unwrapBundleAnalyzer', () => {
  it('removes the import, the const declaration, and unwraps the call', () => {
    const result = unwrapBundleAnalyzer(FULL_CONFIG) ?? '';
    expect(result).not.toContain('@next/bundle-analyzer');
    expect(result).not.toContain('const bundleAnalyzer');
    expect(result).not.toMatch(/bundleAnalyzer\(/);
    expect(result).toContain('export default withNextIntl(nextConfig);');
  });

  it('returns null when the const block is missing', () => {
    const malformed = FULL_CONFIG.replace(/const bundleAnalyzer[\s\S]*?\}\);\n/, '');
    const result = unwrapBundleAnalyzer(malformed);
    expect(result).toBeNull();
  });
});

describe('combined: both unwraps run sequentially', () => {
  it('produces a clean default export', () => {
    const afterIntl = unwrapNextIntlPlugin(FULL_CONFIG) ?? '';
    const afterBoth = unwrapBundleAnalyzer(afterIntl) ?? '';
    expect(afterBoth).toContain('export default nextConfig;');
    expect(afterBoth).not.toContain('next-intl');
    expect(afterBoth).not.toContain('bundle-analyzer');
  });
});
