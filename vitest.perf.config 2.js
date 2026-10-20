// Performance tests (*.perf.test.js) run alone, one file at a time, so other
// test files cannot take the CPU while they measure: npm run test:perf.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.perf.test.js', 'app/**/*.perf.test.js', 'tests/**/*.perf.test.js'],
    exclude: ['**/node_modules/**'],
    fileParallelism: false,
    testTimeout: 30000
  }
});
