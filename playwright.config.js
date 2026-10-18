// End-to-end tests against the web build served by "vite preview". Three
// viewports from the test plan: a desktop window, iPhone 14 and Pixel 7.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/WE-Invoice/app/`,
    trace: 'retain-on-failure',
    locale: 'sk-SK'
  },
  webServer: {
    command: `npm run build:web && npx vite preview --config app/vite.config.js --mode web --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'iphone-14', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } }
  ]
});
