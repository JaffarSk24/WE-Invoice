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
    setupFiles: ['./tests/setup.js']
  }
});
