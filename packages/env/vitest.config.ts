import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    // Env logic is runtime-agnostic and has no DOM; the Node environment is
    // both faster and a more faithful target than jsdom here.
    environment: 'node',
    globals: true,
  },
});
