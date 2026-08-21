import { describe, expect, it } from 'vitest';
import {
  ANALYZE_SCRIPT,
  hasBundleAnalyzer,
  injectBundleAnalyzer,
} from '../../../src/services/setup/bundle-analyzer/transform';
import {
  hasReactCompilerFlag,
  injectReactCompilerFlag,
} from '../../../src/services/setup/react-compiler/transform';

const NEXT_CONFIG = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

describe('injectReactCompilerFlag', () => {
  it('adds the flag inside the nextConfig object', () => {
    const out = injectReactCompilerFlag(NEXT_CONFIG);
    expect(out).toContain('reactCompiler: true');
    expect(hasReactCompilerFlag(out)).toBe(true);
  });

  it('is idempotent', () => {
    const once = injectReactCompilerFlag(NEXT_CONFIG);
    expect(injectReactCompilerFlag(once)).toBe(once);
  });

  it('never flips an explicit `reactCompiler: false`', () => {
    const opted = NEXT_CONFIG.replace('reactStrictMode: true,', 'reactCompiler: false,');
    expect(injectReactCompilerFlag(opted)).toBe(opted);
  });

  it('throws when the canonical config shape is missing', () => {
    expect(() => injectReactCompilerFlag('export default {};')).toThrow(/nextConfig/);
  });
});

describe('injectBundleAnalyzer', () => {
  it('adds the import and wraps the default export', () => {
    const out = injectBundleAnalyzer(NEXT_CONFIG);
    expect(out).toContain("import withBundleAnalyzer from '@next/bundle-analyzer';");
    expect(out).toContain('export default bundleAnalyzer(nextConfig);');
    expect(hasBundleAnalyzer(out)).toBe(true);
  });

  it('is idempotent', () => {
    const once = injectBundleAnalyzer(NEXT_CONFIG);
    expect(injectBundleAnalyzer(once)).toBe(once);
  });

  it('throws when there is no default export to wrap', () => {
    expect(() => injectBundleAnalyzer('const nextConfig = {};')).toThrow(/export default/);
  });

  it('exposes the analyze script value the manifest expects', () => {
    expect(ANALYZE_SCRIPT).toBe('ANALYZE=true next build');
  });
});
