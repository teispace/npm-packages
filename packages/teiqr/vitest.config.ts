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
    // Raised a third time when the PNG decoder grew to the full colour model:
    // every colour type, bit depth, interlacing and `tRNS` is exercised by
    // hand-built fixtures, which moved branch coverage further than any change
    // since the symbologies were unified. The baseline JPEG decoder that
    // followed briefly pushed branches back under the floor, since a decoder is
    // mostly error paths no real file reaches; covering them by rewriting
    // headers by hand restored it rather than the floor being lowered to suit.
    // Raised a fourth time when the camera hook's documented behaviour got
    // tests: autoStart, repeat suppression and downscaling were all prose the
    // suite never read. Reaching them needed a faked camera — jsdom has no
    // canvas and reports `readyState` 0 forever — which is why they were
    // missing rather than merely forgotten.
    // Current: 95.6 lines / 85.7 branches / 95.3 functions / 94.1 statements.
    coverage: withThresholds({ lines: 95, branches: 85, functions: 95, statements: 94 }),
  },
});
