import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs a dedicated API (4100) and web app (3100) against the disposable test
 * database, so it never touches development data.
 * Prerequisite: `npm run test:db:up` from the repository root.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@localhost:5433/deploywatch_test';
const API_PORT = process.env.E2E_API_PORT ?? '4100';
/** Fixed, publicly known key — test data only. Must match global-setup. */
export const E2E_ENCRYPTION_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3100';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npx nest start',
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: API_PORT,
        DATABASE_URL: TEST_DATABASE_URL,
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        JWT_SECRET: 'e2e_jwt_secret',
        JWT_REFRESH_SECRET: 'e2e_jwt_refresh_secret',
        NODE_ENV: 'test',
        ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api/v1`,
        // Separate build dir so E2E can run while the normal dev server is up.
        NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
