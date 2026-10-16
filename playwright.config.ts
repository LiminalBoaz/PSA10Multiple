import { defineConfig, devices } from '@playwright/test';

// Uses the Chromium that ships with this environment when present; otherwise Playwright's own.
const executablePath = process.env.PW_CHROMIUM ?? (process.env.CI ? undefined : '/opt/pw-browsers/chromium');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
