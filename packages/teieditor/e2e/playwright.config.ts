import { defineConfig, devices } from '@playwright/test';

const PORT = 3119;

// Pixel baselines exist for the Linux Playwright image only (`yarn test:visual`).
const VISUAL = /@visual/;
const visual = Boolean(process.env.TEI_VISUAL);

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
  // Hiding the caret or stopping animations injects a style element, which the
  // strict CSP reports (WebKit); the specs wait for animations to end instead.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'allow', caret: 'initial' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: visual ? /@mobile/ : [/@mobile/, VISUAL],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      grepInvert: visual ? /@mobile/ : [/@mobile/, VISUAL],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grepInvert: visual ? /@mobile/ : [/@mobile/, VISUAL],
    },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, grep: /@mobile/, grepInvert: VISUAL },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 15'] },
      grep: /@mobile/,
      grepInvert: VISUAL,
    },
  ],
  webServer: {
    command: `node build.mjs && node serve.mjs`,
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
