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

/**
 * Attach a coverage floor to the shared config.
 *
 * Deliberately a *ratchet*, not an aspiration: each package's numbers are set a
 * couple of points below where it actually sits today, so ordinary fluctuation
 * doesn't turn CI red while a real regression does. Without any floor — the
 * previous state — coverage could only ever drift downward silently, which is
 * how teieditor's registry UI and next-maker's manifests ended up untested.
 *
 * Raise these when you raise coverage; never lower them to make CI pass.
 */
export function withThresholds(thresholds: {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}): CoverageV8Options {
  return { ...coverageConfig, thresholds };
}
