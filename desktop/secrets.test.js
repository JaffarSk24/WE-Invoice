import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createSecrets, keychainUsable } = require('./secrets.cjs');

// A keychain that reverses the text: enough to see that nothing is stored
// in the clear.
function fakeSafeStorage({ available = true, backend = 'kwallet' } = {}) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (s) => Buffer.from(`sealed:${s}`),
    decryptString: (b) => b.toString().replace(/^sealed:/, '')
  };
}

describe('keychain availability', () => {
  it('needs encryption and, on Linux, a real backend', () => {
    expect(keychainUsable(fakeSafeStorage(), 'darwin')).toBe(true);
    expect(keychainUsable(fakeSafeStorage({ available: false }), 'darwin')).toBe(false);
    expect(keychainUsable(fakeSafeStorage({ backend: 'basic_text' }), 'linux')).toBe(false);
    expect(keychainUsable(fakeSafeStorage({ backend: 'gnome_libsecret' }), 'linux')).toBe(true);
    expect(keychainUsable({ isEncryptionAvailable() { throw new Error('x'); } }, 'win32')).toBe(false);
  });
});

describe('weSecrets', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-invoice-secrets-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores sealed values and reads them back', () => {
    const secrets = createSecrets({ safeStorage: fakeSafeStorage(), dir, platform: 'darwin' });
    expect(secrets.available()).toBe(true);
    expect(secrets.get('peppol.verteco.apiKey')).toEqual({ ok: true, value: null });
    expect(secrets.set('peppol.verteco.apiKey', 'key-123')).toEqual({ ok: true, stored: true });
    expect(secrets.get('peppol.verteco.apiKey')).toEqual({ ok: true, value: 'key-123' });
    const raw = fs.readFileSync(path.join(dir, 'peppol.verteco.apiKey.bin')).toString();
    expect(raw).not.toBe('key-123');
    expect(secrets.delete('peppol.verteco.apiKey')).toEqual({ ok: true });
    expect(secrets.get('peppol.verteco.apiKey').value).toBe(null);
  });

  it('takes the names the page builds, with ":" and a company id', async () => {
    const { secretName } = await import('../app/src/peppol/credentials.js');
    const secrets = createSecrets({ safeStorage: fakeSafeStorage(), dir, platform: 'win32' });
    const names = [secretName('0192e4a1-7b2c-7d3e-8f40-123456789abc', 'sapi-sk-sandbox'), 'exim:superfaktura:0192e4a1-7b2c-7d3e-8f40-123456789abc', 'dek', 'smtp.password'];
    for (const name of names) {
      expect(secrets.set(name, '{"clientId":"a","clientSecret":"b"}')).toEqual({ ok: true, stored: true });
      expect(secrets.get(name)).toEqual({ ok: true, value: '{"clientId":"a","clientSecret":"b"}' });
    }
    expect(fs.readdirSync(dir).filter(f => f.includes(':'))).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'peppol~0192e4a1-7b2c-7d3e-8f40-123456789abc~sapi-sk-sandbox.bin'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'smtp.password.bin'))).toBe(true);
    expect(secrets.delete(names[0])).toEqual({ ok: true });
    expect(secrets.get(names[0]).value).toBe(null);
  });

  it('refuses bad names and values', () => {
    const secrets = createSecrets({ safeStorage: fakeSafeStorage(), dir, platform: 'darwin' });
    expect(secrets.get('../etc/passwd').ok).toBe(false);
    expect(secrets.set('x y', 'v')).toEqual({ ok: false, error: 'BAD_NAME' });
    expect(secrets.set('a~b', 'v').ok).toBe(false);
    expect(secrets.set('a/b:c', 'v').ok).toBe(false);
    expect(secrets.set('ok', 42).ok).toBe(false);
    expect(secrets.set('ok', 'x'.repeat(70000)).ok).toBe(false);
    expect(secrets.delete('').ok).toBe(false);
  });

  it('stores nothing when the keychain is not usable', () => {
    const secrets = createSecrets({ safeStorage: fakeSafeStorage({ available: false }), dir, platform: 'win32' });
    expect(secrets.available()).toBe(false);
    expect(secrets.set('smtp.password', 'pw')).toEqual({ ok: true, stored: false });
    expect(fs.existsSync(path.join(dir, 'smtp.password.bin'))).toBe(false);
  });
});
