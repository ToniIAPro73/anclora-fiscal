import { defineConfig, devices } from '@playwright/test';

// Config lives in apps/web (not repo root) because `apps/web` is the only
// package that exposes a `dev` script serving an HTTP server — the webServer
// command below is scoped to this package via pnpm's --filter flag so the
// config stays self-contained and runnable with `pnpm --filter @anclora/web test:e2e`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'env -u NO_COLOR NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:3001 pnpm --filter @anclora/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'env -u NO_COLOR APP_ORIGIN=http://127.0.0.1:3000 pnpm --filter @anclora/api dev',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
