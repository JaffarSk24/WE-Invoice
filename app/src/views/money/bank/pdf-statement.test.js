// @vitest-environment happy-dom
// The password of PDF statements: asked once, kept in the secrets, tried
// on the next PDF, asked again when the PDF refuses it, never kept wrong.
import { describe, it, expect, vi } from 'vitest';
import { createPdfReader, passwordSecret, isPdf } from './pdf-statement.js';

const locked = (password) => async (bytes, options = {}) => {
  if (!options.password) throw Object.assign(new Error('needs'), { code: 'PDF_PASSWORD' });
  if (options.password !== password) throw Object.assign(new Error('wrong'), { code: 'PDF_PASSWORD_WRONG' });
  return { numPages: 1, pageItems: async () => [{ str: 'page' }], destroy: async () => {} };
};
const toText = (items) => items.map(i => i.str).join(' ');
function memorySecrets(start = {}) {
  const map = new Map(Object.entries(start));
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => { map.set(k, v); return true; } };
}

describe('statement PDF password', () => {
  it('opens a PDF without a password as it is', async () => {
    const ask = vi.fn();
    const read = createPdfReader({ secrets: memorySecrets(), companyId: 'c1', session: new Map(), open: async () => ({ numPages: 1, pageItems: async () => [{ str: 'free' }], destroy: async () => {} }), toText, ask });
    expect(await read(new Uint8Array([1]))).toBe('free');
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks once, keeps the password and opens the next statements with it', async () => {
    const secrets = memorySecrets();
    const ask = vi.fn(async () => 'heslo');
    const read = createPdfReader({ secrets, companyId: 'c1', session: new Map(), open: locked('heslo'), toText, ask });
    expect(await read(new Uint8Array([1]), 'a.pdf')).toBe('page');
    expect(await read(new Uint8Array([2]), 'b.pdf')).toBe('page');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(secrets.map.get(passwordSecret('c1'))).toBe('heslo');
    // A new import (a new reader) takes the kept one without asking.
    const again = vi.fn();
    expect(await createPdfReader({ secrets, companyId: 'c1', session: new Map(), open: locked('heslo'), toText, ask: again })(new Uint8Array([3]))).toBe('page');
    expect(again).not.toHaveBeenCalled();
  });

  it('asks again when the kept password no longer opens it, and keeps only the right one', async () => {
    const secrets = memorySecrets({ [passwordSecret('c1')]: 'old' });
    const ask = vi.fn().mockResolvedValueOnce('typo').mockResolvedValueOnce('new');
    const read = createPdfReader({ secrets, companyId: 'c1', session: new Map(), open: locked('new'), toText, ask });
    expect(await read(new Uint8Array([1]), 'a.pdf')).toBe('page');
    expect(ask.mock.calls.map(c => c[0].wrong)).toEqual([true, true]);
    expect(secrets.map.get(passwordSecret('c1'))).toBe('new');
  });

  it('gives up when the user cancels', async () => {
    const read = createPdfReader({ secrets: memorySecrets(), companyId: 'c1', session: new Map(), open: locked('x'), toText, ask: async () => null });
    await expect(read(new Uint8Array([1]))).rejects.toMatchObject({ code: 'BANK_PDF_PASSWORD_MISSING' });
  });

  it('tells a PDF by its first bytes', () => {
    expect(isPdf(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(isPdf(new TextEncoder().encode('<?xml'))).toBe(false);
  });
});
