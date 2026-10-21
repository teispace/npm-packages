import { defineConfig, devices } from '@playwright/test';

const PORT = 3119;

/**
 * The editor and its UI in real engines, under a strict CSP: what jsdom
 * cannot show (typing, beforeinput, clipboard, layout, top-layer popovers,
 * focus, scrolling). Visual baselines are per engine and platform.
 */
export default defineConfig({
  testDir: './specs',
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@mobile/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grepInvert: /@mobile/ },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: `node build.mjs && node serve.mjs`,
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
