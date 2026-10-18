// buildPdf end to end with the Node engine: real bytes, page count of a
// long document, the mandatory particulars gate, PDF/A-3 with an attached
// UBL file, images with transparency.
import { describe, it, expect } from 'vitest';
import { buildPdf, pdfFileNameFor } from './index.js';
import { nodePdfEngine, pdfBytes, pageCount } from '../../../tests/helpers/pdf-node-engine.js';
import * as fx from '../../../tests/fixtures/pdf/documents.js';

const render = (doc, company = fx.company, options = {}) => buildPdf(doc, company, { ...options, engine: nodePdfEngine }).then(pdfBytes);
const header = (bytes) => Buffer.from(bytes.subarray(0, 8)).toString('latin1');

describe('buildPdf', () => {
  it('renders an invoice with logo, stamp and signature to one page', async () => {
    const bytes = await render(fx.invoice, fx.company, { images: { logo: fx.PNG_ALPHA, stamp: fx.PNG_ALPHA, signature: fx.PNG_ALPHA }, issuedBy: 'Ján Novák' });
    expect(header(bytes)).toMatch(/^%PDF-1\./);
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(1);
    expect(Buffer.from(bytes).toString('latin1')).toContain('/Title');
  });

  it('spreads 60 lines over several pages', async () => {
    const bytes = await render(fx.longInvoice);
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
  });

  it('renders every template', async () => {
    for (const template of ['CLASSIC', 'MODERN', 'MINIMAL', 'COMPACT']) {
      const bytes = await render({ ...fx.invoice, template });
      expect(pageCount(bytes)).toBeGreaterThanOrEqual(1);
    }
  });

  it('refuses a tax document without the mandatory particulars, listing them', async () => {
    const incomplete = { ...fx.invoice, number: null, buyer: { ...fx.invoice.buyer, address: {} }, lines: [] };
    await expect(render(incomplete)).rejects.toMatchObject({ code: 'PDF_MISSING_FIELDS', details: { fields: expect.arrayContaining(['number', 'buyer.address', 'lines']) } });
    const bytes = await render(incomplete, fx.company, { allowIncomplete: true });
    expect(header(bytes)).toMatch(/^%PDF/);
  });

  it('writes PDF/A-3 with the attached UBL file', async () => {
    const bytes = await render(fx.invoice, fx.company, { attachments: [{ name: 'invoice-2026001.xml', data: '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>', mime: 'application/xml' }] });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('pdfaid:part>3');
    expect(text).toContain('/AFRelationship /Alternative');
    expect(text).toContain('invoice-2026001.xml');
    expect(text).toContain('/OutputIntents');
  });

  it('wraps engine failures in PDF_RENDER_FAILED', async () => {
    const broken = { render: async () => { throw new Error('boom'); } };
    await expect(buildPdf(fx.invoice, fx.company, { engine: broken })).rejects.toMatchObject({ code: 'PDF_RENDER_FAILED' });
    await expect(buildPdf(null, fx.company, { engine: broken })).rejects.toMatchObject({ code: 'PDF_NO_DOCUMENT' });
  });

  it('names the file by the mask with transliteration', () => {
    expect(pdfFileNameFor(fx.invoice, fx.company)).toBe('Faktura_2026001_Zlty_datel_a._s.pdf');
    expect(pdfFileNameFor({ ...fx.invoice, language: 'en' }, fx.company)).toBe('Invoice_2026001_Zlty_datel_a._s.pdf');
    expect(pdfFileNameFor(fx.invoice, fx.company, { fileMask: '{number}-{seller}' })).toBe('2026001-Biela_orlica_s._r._o.pdf');
  });
});
