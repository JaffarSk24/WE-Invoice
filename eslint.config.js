// One lint configuration for the whole repository. Each area gets only the
// globals it may use: packages/core is pure logic, so it sees no DOM and no
// network; the app sees the browser; the desktop main process sees Node.
import js from '@eslint/js';

const pureGlobals = {
  console: 'readonly',
  crypto: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  Intl: 'readonly',
  globalThis: 'readonly',
  structuredClone: 'readonly',
  URL: 'readonly'
};

const browserGlobals = {
  ...pureGlobals,
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  indexedDB: 'readonly',
  location: 'readonly',
  history: 'readonly',
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  URLSearchParams: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  HTMLElement: 'readonly',
  Node: 'readonly',
  Event: 'readonly',
  KeyboardEvent: 'readonly',
  CustomEvent: 'readonly',
  Notification: 'readonly',
  BroadcastChannel: 'readonly',
  CompressionStream: 'readonly',
  DecompressionStream: 'readonly',
  Worker: 'readonly',
  __APP_VERSION__: 'readonly',
  __WEB_BUILD__: 'readonly',
  __GATEWAY_URL__: 'readonly'
};

const nodeGlobals = {
  ...pureGlobals,
  process: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  URLSearchParams: 'readonly'
};

const commonRules = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  // Production code logs through console.warn / console.error only; a stray
  // console.log is debugging left behind.
  'no-console': ['error', { allow: ['warn', 'error', 'info'] }]
};

export default [
  js.configs.recommended,
  {
    files: ['packages/**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: pureGlobals },
    rules: commonRules
  },
  {
    files: ['app/**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: browserGlobals },
    rules: commonRules
  },
  {
    files: ['desktop/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, require: 'readonly', module: 'writable', exports: 'writable', __dirname: 'readonly', __filename: 'readonly' }
    },
    rules: commonRules
  },
  {
    files: ['gateway/**/*.js', 'scripts/**/*.mjs', 'gateway/**/*.mjs', '*.config.js', 'app/vite.config.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: nodeGlobals },
    rules: { ...commonRules, 'no-console': 'off' }
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...browserGlobals, ...nodeGlobals } },
    rules: { ...commonRules, 'no-console': 'off' }
  },
  {
    files: ['site/**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: browserGlobals },
    rules: commonRules
  },
  {
    ignores: ['dist/**', 'dist-web/**', 'release/**', 'release.nosync/**', '**/node_modules/**', 'coverage/**',
      'test-results/**', 'playwright-report/**', 'private/**', 'docs/tz/**']
  }
];
