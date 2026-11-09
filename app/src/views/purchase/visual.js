// What a received e-invoice looks like on paper. An eFaktúra is data; its
// picture comes from the Peppol provider (its PDF: the supplier's own one
// when the XML carries it, else one the provider renders, with the payment
// QR), archived next to the XML. When the provider has none, the PDF
// attached in the XML itself is shown. The app does not draw one of its own.

/** Canvases of the pages of PDF bytes: [{ canvas, items: [] }]. */
export async function pdfCanvases(bytes, { openPdf, width, max }) {
  const pdf = await openPdf(bytes);
  try {
    const out = [];
    for (let n = 1; n <= Math.min(pdf.numPages, max); n++) {
      const canvas = document.createElement('canvas');
      await pdf.renderPage(n, canvas, width);
      out.push({ canvas, items: [] });
    }
    return out;
  } finally {
    await pdf.destroy();
  }
}

/**
 * Pages of a received e-invoice and where they came from, or null when there is no picture.
 * @param {{providerPdf?: Function, readAttachment?: Function, openPdf: Function, width: number, max: number}} deps
 * @returns {Promise<{pages: object[], source: 'PROVIDER'|'ATTACHMENT'}|null>}
 */
export async function receivedVisual(doc, { providerPdf = null, readAttachment = null, openPdf, width, max }) {
  if (providerPdf) {
    try {
      const bytes = await providerPdf(doc);
      if (bytes && bytes.length) return { pages: await pdfCanvases(bytes, { openPdf, width, max }), source: 'PROVIDER' };
    } catch (e) {
      console.warn('The provider has no picture of the e-invoice now', e.code || e.name);
    }
  }
  const attachment = (doc.attachments || []).find(a => /pdf/i.test(a.mime || '') || /\.pdf$/i.test(a.name || ''));
  if (attachment && readAttachment) {
    try {
      const bytes = await readAttachment(attachment);
      if (bytes && bytes.length) return { pages: await pdfCanvases(bytes, { openPdf, width, max }), source: 'ATTACHMENT' };
    } catch (e) {
      console.warn('The PDF attached to the e-invoice could not be read', e.code || e.name);
    }
  }
  return null;
}
