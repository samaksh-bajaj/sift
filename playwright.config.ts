import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    command: 'pnpm --filter @sift/web exec vite --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: { VITE_DEMO_MODE: 'true' },
  },
  reporter: 'list',
});
