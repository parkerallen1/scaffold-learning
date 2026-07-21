import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: useExternalServer
    ? undefined
    : [
        {
          command: 'npm run e2e:emulators',
          // Auth and Firestore can accept traffic before callable discovery finishes.
          // Gate the browser on an initialized Function so the first teacher bootstrap
          // cannot race the Functions emulator startup.
          url: 'http://127.0.0.1:5001/demo-scaffold-learning/us-central1/healthcheck',
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'npm run e2e:preview',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
});
