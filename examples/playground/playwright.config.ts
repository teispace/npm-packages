import { defineConfig, devices } from '@playwright/test';

const PORT = 3108;

/**
 * The editor under a strict CSP, in all three engines. Runs against the
 * production build: the dev server needs a relaxed policy (see src/proxy.ts),
 * so only `next start` enforces the real one.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // Rebuild the package first: the app consumes its dist/, and testing a
    // stale build would prove nothing about the source.
    command: `yarn workspace @teispace/teieditor build && yarn build && yarn start --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
  },
});
