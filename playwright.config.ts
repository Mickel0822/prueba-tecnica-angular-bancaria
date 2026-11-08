import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4200';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 3,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 90_000,
  },
  projects: [
    { name: 'chromium', testMatch: '**/*.ui.spec.ts', use: devices['Desktop Chrome'] },
    { name: 'firefox', testMatch: '**/*.ui.spec.ts', use: devices['Desktop Firefox'] },
    { name: 'webkit', testMatch: '**/*.ui.spec.ts', use: devices['Desktop Safari'] },
    { name: 'integration', testMatch: '**/*.integration.spec.ts', use: devices['Desktop Chrome'] },
  ],
});
