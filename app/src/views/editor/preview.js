// The live PDF preview beside the editor (a tab on narrow screens): the
// draft is printed as it would be issued, with the number it will get and
// the company as the seller, missing particulars allowed. Rebuilt a moment
// after the last change; the previous object URL is released.
import { companySnapshot } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { buildPdf } from '../../pdf/index.js';
import { pdfOptions } from '../documents/pdf-options.js';

const DELAY_MS = 700;

/** The document as the preview prints it. */
export function previewDocument(doc, { company, totals, number }) {
  return {
    ...doc, totals: totals || doc.totals, number: doc.number || number || null,
    seller: doc.seller && doc.seller.name ? doc.seller : (company ? companySnapshot(company) : null)
  };
}

export function createPdfPreview() {
  const frame = h('iframe', { class: 'pdf-frame', title: t('documents.preview.title') });
  const status = h('p', { class: 'muted small pdf-status', 'aria-live': 'polite' }, t('documents.preview.loading'));
  const el = h('div', { class: 'editor-preview card' }, status, frame);
  let url = null;
  let timer = null;
  let ticket = 0;

  const render = async (doc, company, documents) => {
    const my = ++ticket;
    status.textContent = t('documents.preview.loading');
    status.hidden = false;
    try {
      const blob = await buildPdf(doc, company, { ...pdfOptions(doc, company, documents), allowIncomplete: true });
      if (my !== ticket) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      frame.src = url;
      status.hidden = true;
    } catch (e) {
      if (my !== ticket) return;
      console.error('PDF preview failed', e);
      status.textContent = t('documents.preview.failed');
    }
  };

  return {
    el,
    update(doc, company, documents = []) {
      clearTimeout(timer);
      timer = setTimeout(() => render(doc, company, documents), DELAY_MS);
    },
    destroy() {
      clearTimeout(timer);
      ticket += 1;
      if (url) URL.revokeObjectURL(url);
      url = null;
    }
  };
}
