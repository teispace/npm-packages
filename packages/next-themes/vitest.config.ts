import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['__tests__/setup.ts'],
    coverage: coverageConfig,
  },
});
