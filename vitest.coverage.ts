import type { CoverageV8Options } from 'vitest/node';

/**
 * Shared coverage settings for every package's vitest.config.ts. Centralised so
 * the provider, reporters, and exclude list stay consistent across packages and
 * CI's per-package lcov upload always has the same shape.
 *
 * `lcov` is emitted for Codecov; `text` prints a summary locally and in CI logs.
 * No global thresholds are set here (suites vary widely in surface area); add a
 * per-package `thresholds` override where a floor is meaningful.
 */
export const coverageConfig: CoverageV8Options = {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  include: ['src/**'],
  exclude: [
    'src/**/*.d.ts',
    // Type-only and barrel files carry no executable logic worth measuring.
    'src/**/types.ts',
    'src/**/index.ts',
  ],
};
