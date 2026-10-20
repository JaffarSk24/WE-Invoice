// The build modes of app/vite.config.js: only the end-to-end test build
// lowers the PBKDF2 rounds, and it goes to its own folder, so the desktop
// and the published web build keep the full key derivation.
import { describe, it, expect } from 'vitest';
import config, { E2E_KDF_ITERATIONS } from './vite.config.js';
import { ITERATIONS } from './src/sync/crypto.js';

const build = (mode) => config({ mode, command: 'build' });

describe('build modes', () => {
  it('keeps the full key derivation in the desktop and web builds', () => {
    for (const mode of ['production', 'web']) expect(build(mode).define.__KDF_ITERATIONS__).toBe('null');
    expect(build('web').build.outDir).toMatch(/dist-web$/);
    expect(ITERATIONS).toBe(600000);
  });

  it('lowers it only in the e2e build, built apart from the web build', () => {
    const e2e = build('e2e');
    expect(e2e.define.__KDF_ITERATIONS__).toBe(String(E2E_KDF_ITERATIONS));
    expect(E2E_KDF_ITERATIONS).toBeGreaterThanOrEqual(1000);
    expect(e2e.build.outDir).toMatch(/dist-e2e$/);
    expect(e2e.base).toBe(build('web').base);
    expect(e2e.define.__WEB_BUILD__).toBe('true');
  });
});
