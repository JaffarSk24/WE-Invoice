// Bulk actions of a sales list: download the PDFs, send (the e-mail
// package listens to document:send), mark as paid, and copy one selected
// document into a new draft opened for editing. Drafts are skipped,
// and so are cash and card documents when marking paid: each of those
// payments needs its own eKasa receipt, so they are recorded one by one.
import { isPayable, cmp } from '@we-invoice/core';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { todayLocal } from '../../components/dates.js';
import { addPayment, createDraft } from '../editor/actions.js';
import { duplicateDocument } from '../editor/draft.js';
import { companyNow, allDocuments, allContacts, salesStore, guardWrite } from './source.js';
import { salesHash, routeForKind } from './kinds.js';
import { pdfOptions } from './pdf-options.js';

const EKASA_METHODS = new Set(['CASH', 'CARD', 'QR_ON_SITE']);
const issued = (row) => row.status !== 'DRAFT' && row.status !== 'CANCELLED';

export function downloadPdf(doc, { company = companyNow(), documents = allDocuments() } = {}) {
  return new Promise((resolve) => {
    emit('pdf:download', { document: doc, company, options: pdfOptions(doc, company, documents), done: resolve, fail: () => resolve(null) });
  });
}

export async function bulkPdf(rows) {
  const docs = rows.filter(issued).map(r => r.doc);
  if (!docs.length) { showToast(t('documents.bulk.nothingIssued'), { type: 'info' }); return; }
  for (const doc of docs) await downloadPdf(doc);
}

export function bulkSend(rows) {
  const docs = rows.filter(issued);
  if (!docs.length) { showToast(t('documents.bulk.nothingIssued'), { type: 'info' }); return; }
  docs.forEach(r => emit('document:send', { documentId: r.id }));
  showToast(t('documents.bulk.sendRequested', { n: docs.length }), { type: 'info' });
}

/** Rows a bulk "paid" may settle, and those left for one by one entry. */
export function payableSelection(rows) {
  const open = rows.filter(r => issued(r) && isPayable(r.kind) && cmp(r.due, '0') > 0);
  return {
    settle: open.filter(r => !EKASA_METHODS.has(r.doc.paymentMethod)),
    oneByOne: open.filter(r => EKASA_METHODS.has(r.doc.paymentMethod))
  };
}

export async function bulkMarkPaid(rows) {
  if (!guardWrite()) return;
  const store = salesStore();
  const { settle, oneByOne } = payableSelection(rows);
  const today = todayLocal();
  let done = 0;
  for (const row of settle) {
    try {
      await addPayment(store, row.id, { date: today, amount: row.due, method: row.doc.paymentMethod || 'TRANSFER' });
      done += 1;
    } catch (e) {
      showError(e);
    }
  }
  showToast(t('documents.bulk.markedPaid', { n: done }), { type: done ? 'success' : 'info' });
  if (oneByOne.length) showToast(t('documents.bulk.cashOneByOne', { n: oneByOne.length }), { type: 'info', duration: 8000 });
}

/** Copies the one selected document into a draft (number given at issue) and opens it for editing. */
export async function copySelected(rows) {
  const doc = rows[0] && (rows[0].doc || rows[0]);
  if (!doc || !guardWrite()) return null;
  try {
    const contact = allContacts().find(c => c.id === doc.contactId) || null;
    const stored = await createDraft(salesStore(), duplicateDocument(doc, { today: todayLocal(), company: companyNow(), contact }));
    showToast(t('documents.toast.copied'), { type: 'success' });
    window.location.hash = salesHash(routeForKind(stored.kind) || 'invoices', { id: stored.id, mode: 'edit' });
    return stored;
  } catch (e) {
    showError(e);
    return null;
  }
}

export function bulkActions() {
  return [
    { label: t('documents.action.copy'), icon: 'copy', onClick: copySelected, single: true },
    { label: t('documents.bulk.pdf'), icon: 'download', onClick: bulkPdf },
    { label: t('documents.bulk.send'), icon: 'send', onClick: bulkSend },
    { label: t('documents.bulk.markPaid'), icon: 'banknote', onClick: bulkMarkPaid }
  ];
}
