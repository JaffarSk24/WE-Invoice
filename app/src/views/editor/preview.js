// The live PDF preview beside the editor (a tab on narrow screens): the
// draft is printed as it would be issued, with the number it will get and
// the company as the seller, missing particulars allowed. Rebuilt a moment
// after the last change; the previous object URL is released. Where the
// page may not frame blob URLs, a button opens the preview in a new tab.
import { companySnapshot } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { buildPdf, pdfFileNameFor } from '../../pdf/index.js';
import { pdfOptions } from '../documents/pdf-options.js';
import { canFrameBlobs, openPdf } from '../documents/pdf-frame.js';

const DELAY_MS = 700;

/** The document as the preview prints it. */
export function previewDocument(doc, { company, totals, number }) {
  return {
    ...doc, totals: totals || doc.totals, number: doc.number || number || null,
    seller: doc.seller && doc.seller.name ? doc.seller : (company ? companySnapshot(company) : null)
  };
}

function tabPreview() {
  let last = null;
  const open = async () => {
    if (!last) return;
    try {
      const blob = await buildPdf(last.doc, last.company, { ...pdfOptions(last.doc, last.company, last.documents), allowIncomplete: true });
      openPdf(blob, pdfFileNameFor(last.doc, last.company));
    } catch (e) {
      console.error('PDF preview failed', e);
      status.textContent = t('documents.preview.failed');
    }
  };
  const status = h('p', { class: 'muted small' }, t('documents.preview.inTab'));
  const el = h('div', { class: 'editor-preview card' }, status,
    h('button', { type: 'button', class: 'btn', id: 'editor-open-preview', onclick: open }, t('documents.preview.open')));
  return { el, update(doc, company, documents = []) { last = { doc, company, documents }; }, destroy() { last = null; } };
}

export function createPdfPreview({ framed = canFrameBlobs() } = {}) {
  if (!framed) return tabPreview();
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
