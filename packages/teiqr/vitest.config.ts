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
    // layers landed together, and raised twice since: once when the three
    // symbologies were unified behind one segmenter, and again when the
    // vector-export and image-input paths gained real unit tests. The host-API
    // branches that used to be unreachable from Node — OffscreenCanvas,
    // document.createElement, createImageBitmap — are now covered by stubbing
    // the globals, which is what they were always missing.
    // Current: 94.2 lines / 83.0 branches / 95.2 functions / 92.5 statements.
    coverage: withThresholds({ lines: 94, branches: 82, functions: 95, statements: 92 }),
  },
});
