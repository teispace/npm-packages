import { defineConfig } from 'vitest/config';
import { withThresholds } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    // Everything here is runtime-agnostic and DOM-free; the Node environment is
    // both faster and a more faithful target than jsdom. The cross-runtime
    // suite proves the DOM-free claim by making DOM globals throw.
    environment: 'node',
    globals: true,
    // Several suites rasterise and decode dozens of styled symbols; under v8
    // coverage instrumentation that comfortably exceeds the 5s default.
    testTimeout: 60_000,
    // Measured floors, used as a ratchet rather than a target: they sit just
    // under current coverage so a regression fails CI, and they are raised
    // when coverage improves.
    //
    // Re-baselined downward once, when the export, React, CLI and Micro QR
    // layers landed together. Those added roughly 2,500 lines, a slice of
    // which is genuinely hard to reach from Node — the canvas paths in
    // <QrCanvas>, the createImageBitmap fallbacks, and error branches that
    // need a failing filesystem. Current: 88.8 lines / 75.2 branches /
    // 91.8 functions / 86.9 statements.
    coverage: withThresholds({ lines: 88, branches: 74, functions: 91, statements: 86 }),
  },
});
