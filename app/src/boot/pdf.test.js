// The PDF service on the event bus: build, download (saved through the
// transport under the masked name, confirmed by a toast), preview and the
// particulars check; a failure reaches the toast and the fail callback.
import { describe, it, expect, vi } from 'vitest';
import { boot } from './pdf.js';
import { setPdfEngine } from '../pdf/index.js';
import * as fx from '../../../tests/fixtures/pdf/documents.js';

function fakeContext() {
  const handlers = new Map();
  const ctx = {
    on: (event, fn) => handlers.set(event, fn),
    emit: (event, payload) => handlers.get(event)(payload),
    t: (key, params) => `${key}${params ? ` ${JSON.stringify(params)}` : ''}`,
    showToast: vi.fn(),
    showError: vi.fn(),
    transport: { files: { saveAs: vi.fn(async () => {}) } }
  };
  return ctx;
}

describe('boot/pdf', () => {
  const engine = { render: vi.fn(async () => new Blob(['%PDF-fake'], { type: 'application/pdf' })) };
  setPdfEngine(engine);

  it('builds, downloads, previews and checks', async () => {
    const ctx = fakeContext();
    await boot(ctx);
    const built = await new Promise(resolve => ctx.emit('pdf:build', { document: fx.invoice, company: fx.company, done: r => resolve(r) }));
    expect(built).toBeInstanceOf(Blob);
    const name = await new Promise(resolve => ctx.emit('pdf:download', { document: fx.invoice, company: fx.company, done: r => resolve(r) }));
    expect(name).toBe('Faktura_2026001_Zlty_datel_a._s.pdf');
    expect(ctx.transport.files.saveAs).toHaveBeenCalledWith(name, expect.any(Blob));
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('pdf.toast.saved'), { type: 'success' });
    const url = await new Promise(resolve => ctx.emit('pdf:preview', { document: { ...fx.invoice, number: null }, company: fx.company, done: r => resolve(r) }));
    expect(url).toMatch(/^blob:/);
    const missing = await new Promise(resolve => ctx.emit('pdf:check', { document: { ...fx.invoice, number: null }, company: fx.company, done: r => resolve(r) }));
    expect(missing).toEqual(['number']);
  });

  it('reports a refused document through the toast and fail()', async () => {
    const ctx = fakeContext();
    await boot(ctx);
    const error = await new Promise(resolve => ctx.emit('pdf:build', { document: { ...fx.invoice, lines: [] }, company: fx.company, fail: e => resolve(e) }));
    expect(error.code).toBe('PDF_MISSING_FIELDS');
    expect(ctx.showError).toHaveBeenCalledWith(error, 'errors.PDF_RENDER_FAILED');
  });
});
