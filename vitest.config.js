// Unit tests for every part of the client: the pure core, the app logic
// (with happy-dom where a test needs a DOM) and the desktop helpers. The
// gateway is a separate package with its own tests (npm run test:gateway).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __WEB_BUILD__: JSON.stringify(false),
    __GATEWAY_URL__: JSON.stringify('http://localhost:8787'),
    __GOOGLE_CLIENT_ID__: JSON.stringify('test-client-id.apps.googleusercontent.com')
  },
  test: {
    include: ['packages/**/*.test.js', 'app/**/*.test.js', 'desktop/**/*.test.js', 'tests/**/*.test.js'],
    exclude: ['**/node_modules/**', 'tests/e2e/**', 'gateway/**', '**/*.perf.test.js'],
    setupFiles: ['./tests/setup.js'],
    // npm run test:coverage: the targets of the test plan (§ 11.1) for the
    // core, 100 % of lines for the VAT, numbering, UBL, tax and ledger
    // modules, 80 % for the app logic.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['packages/core/**/*.js', 'app/src/**/*.js', 'desktop/**/*.cjs'],
      exclude: ['**/*.test.js', '**/*.perf.test.js', '**/fixtures.js', 'app/src/i18n/**', 'app/src/peppol/mock-provider.js', 'app/src/sync/drive-mock.js']
    }
  }
});
