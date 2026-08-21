import { defineConfig } from 'vitest/config';
import { withThresholds } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    coverage: withThresholds({ lines: 39, branches: 36, functions: 41, statements: 39 }),
  },
});
