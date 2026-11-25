import { defineConfig } from '@playwright/test';

const origin = 'http://127.0.0.1:4175';

// From frontend/: npm ci, npx playwright install chromium, npm run test:e2e.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './node_modules/.cache/playwright',
  use: { baseURL: origin, browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --port 4175 --strictPort',
    env: { VITE_API_BASE_URL: origin },
    url: origin,
    reuseExistingServer: false,
  },
});
