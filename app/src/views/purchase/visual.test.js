// @vitest-environment happy-dom
// The picture of a received eFaktúra: the provider's PDF first, the PDF
// attached in the XML when the provider has none, nothing drawn by the app.
import { describe, it, expect, vi } from 'vitest';
import { receivedVisual } from './visual.js';

const pdfBytes = new Uint8Array([37, 80, 68, 70]);
const openPdf = vi.fn(async () => ({ numPages: 2, renderPage: async () => {}, destroy: async () => {} }));
const doc = { id: 'd', attachments: [{ id: 'a1', name: 'faktura.pdf', mime: 'application/pdf' }] };

describe('received e-invoice picture', () => {
  it('shows the provider PDF first', async () => {
    const readAttachment = vi.fn();
    const out = await receivedVisual(doc, { providerPdf: async () => pdfBytes, readAttachment, openPdf, width: 100, max: 3 });
    expect(out.source).toBe('PROVIDER');
    expect(out.pages).toHaveLength(2);
    expect(readAttachment).not.toHaveBeenCalled();
  });

  it('falls back to the PDF in the XML, and to nothing', async () => {
    const offline = async () => { throw Object.assign(new Error('x'), { code: 'PEPPOL_NETWORK' }); };
    expect((await receivedVisual(doc, { providerPdf: offline, readAttachment: async () => pdfBytes, openPdf, width: 100, max: 1 })).source).toBe('ATTACHMENT');
    expect(await receivedVisual({ id: 'e', attachments: [] }, { providerPdf: async () => null, openPdf, width: 100, max: 1 })).toBeNull();
  });
});
