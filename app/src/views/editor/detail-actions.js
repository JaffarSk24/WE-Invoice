// The actions of an issued document: PDF, print, send by e-mail (the
// e-mail package hears document:send), send through Peppol (peppol:send,
// tax documents only), add a payment, edit while canEdit allows (a locked
// document after a confirmed reason, never in a closed VAT period), copy,
// the conversions and the statuses a user may set. Every write goes through the guard, so demo
// mode and read-only data say why nothing happened.
import { canEdit, canTransition, isPayable, isTaxDocument, allowedStatuses } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textArea } from '../../components/fields.js';
import { showUndoToast } from '../../components/undo-toast.js';
import { todayLocal } from '../../components/dates.js';
import { salesHash, routeForKind } from '../documents/kinds.js';
import { salesStore, guardWrite, allContacts } from '../documents/source.js';
import { downloadPdf } from '../documents/bulk.js';
import { blockingPeriod } from '../documents/period-guard.js';
import { pdfOptions } from '../documents/pdf-options.js';
import { buildPdf, pdfFileNameFor } from '../../pdf/index.js';
import { canFrameBlobs, openPdf } from '../documents/pdf-frame.js';
import { isDemo } from '../shell/demo-mode.js';
import { createDraft, addPayment, removePayment, updatePayment, setStatus, unlockDocument } from './actions.js';
import { availableConversions, convertForEditor, needsReason } from './convert.js';
import { duplicateDocument } from './draft.js';
import { openPaymentDialog } from './payments.js';

function askText({ title, label, okLabel }) {
  return new Promise(resolve => {
    let done = false;
    const field = textArea({ label, rows: 3, attrs: { id: 'ask-text' } });
    openModal({
      title, body: field.el, onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: t('common.cancel'), onClick: (m) => m.close() },
        { label: okLabel, kind: 'primary', onClick: (m) => { const v = field.value().trim(); if (!v) { field.setError(t('documents.convert.reasonRequired')); return; } done = true; resolve(v); m.close(); } }
      ]
    });
  });
}

async function printPdf(doc, company, documents) {
  try {
    const blob = await buildPdf(doc, company, pdfOptions(doc, company, documents));
    if (!canFrameBlobs()) { openPdf(blob, pdfFileNameFor(doc, company)); return; }
    const url = URL.createObjectURL(blob);
    const frame = h('iframe', { class: 'print-frame', title: t('documents.action.print'), src: url });
    frame.addEventListener('load', () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { console.warn('Printing from the page failed, opening the PDF', e); window.open(url, '_blank', 'noopener'); }
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
    });
    document.body.append(frame);
  } catch (e) {
    showError(e, 'errors.PDF_RENDER_FAILED');
  }
}

export function detailActions({ doc, row, company, route, documents }) {
  const store = () => salesStore();
  const contact = () => allContacts().find(c => c.id === doc.contactId) || null;
  const open = (target, mode = 'view') => { window.location.hash = salesHash(routeForKind(target.kind) || route, { id: target.id, mode }); };
  const canWrite = () => !isDemo() && Boolean(store()) && !store().readOnly;

  async function edit() {
    if (blockingPeriod(doc, doc, company)) { showToast(t('errors.TAX_PERIOD_CLOSED'), { type: 'error' }); return; }
    const check = canEdit(doc);
    if (check.editable) {
      if (isTaxDocument(doc.kind) && !(await confirmDialog(t('documents.detail.editIssuedConfirm')))) return;
      open(doc, 'edit');
      return;
    }
    if (check.reason !== 'DOCUMENT_LOCKED') { showToast(t(`errors.${check.reason}`), { type: 'error' }); return; }
    if (!guardWrite()) return;
    const reason = await askText({ title: t('documents.detail.unlockTitle'), label: t('documents.detail.unlockReason'), okLabel: t('documents.detail.unlock') });
    if (!reason) return;
    try { await unlockDocument(store(), doc.id, reason); open(doc, 'edit'); } catch (e) { showError(e); }
  }

  async function convert(target) {
    if (!guardWrite()) return;
    let reason;
    if (needsReason(target)) {
      reason = await askText({ title: t(`documents.convert.${target}`), label: t('documents.editor.correctionReason'), okLabel: t('documents.convert.create') });
      if (!reason) return;
    }
    try {
      const draft = convertForEditor(doc, target, { documents, today: todayLocal(), reason, company, contact: contact() });
      const stored = await createDraft(store(), draft);
      showToast(t('documents.toast.converted', { kind: t(`document.kind.${target}`) }), { type: 'success' });
      open(stored, 'edit');
    } catch (e) {
      showError(e);
    }
  }

  async function copy() {
    if (!guardWrite()) return;
    try {
      const stored = await createDraft(store(), duplicateDocument(doc, { today: todayLocal(), company, contact: contact() }));
      showToast(t('documents.toast.copied'), { type: 'success' });
      open(stored, 'edit');
    } catch (e) { showError(e); }
  }

  async function status(next) {
    if (!guardWrite()) return;
    if (next === 'CANCELLED' && !(await confirmDialog(t('documents.detail.cancelConfirm'), { danger: true }))) return;
    try { await setStatus(store(), doc.id, next); showToast(t('documents.toast.status', { status: t(`status.${next}`) }), { type: 'success' }); } catch (e) { showError(e); }
  }

  const saveReceipt = async (paymentId, fields) => {
    if (!guardWrite()) return;
    try { await updatePayment(store(), doc.id, paymentId, fields); } catch (e) { showError(e); }
  };

  function pay() {
    if (!guardWrite()) return;
    openPaymentDialog({
      doc, company, onReceipt: saveReceipt,
      onSave: async (values) => {
        try {
          const payment = await addPayment(store(), doc.id, values);
          showToast(t('documents.toast.paymentAdded'), { type: 'success' });
          return payment;
        } catch (e) { showError(e); return null; }
      }
    });
  }

  function removePaymentWithUndo(payment) {
    if (!guardWrite()) return;
    const before = (doc.payments || []).slice();
    removePayment(store(), doc.id, payment.id).catch(e => showError(e));
    showUndoToast(t('documents.toast.paymentRemoved'), { commit: () => {}, revert: () => store().update('documents', doc.id, { payments: before }).catch(e => showError(e)) });
  }

  // Statuses the user may set by hand; payment statuses come from payments.
  const manual = ['SENT', 'ACCEPTED', 'REJECTED', 'PROCESSED', 'CANCELLED']
    .filter(s => allowedStatuses(doc.kind).includes(s) && canTransition(doc.kind, doc.status, s))
    .filter(s => s !== 'CANCELLED' || !isTaxDocument(doc.kind));

  function buttons() {
    const btn = (label, iconName, onclick, attrs = {}) => h('button', { type: 'button', class: 'btn', onclick, ...attrs }, icon(iconName), label);
    const more = [
      btn(t('documents.action.print'), 'printer', () => printPdf(doc, company, documents)),
      isTaxDocument(doc.kind) ? btn(t('documents.action.peppol'), 'send', () => emit('peppol:send', { documentId: doc.id }), { id: 'detail-peppol' }) : null,
      btn(t('documents.action.copy'), 'copy', copy, { id: 'detail-copy' }),
      doc.kind === 'INVOICE' ? btn(t('documents.action.recurring'), 'repeat', () => emit('recurring:from-document', { documentId: doc.id }), { id: 'detail-recurring' }) : null,
      ...availableConversions(doc, documents).map(target => btn(t(`documents.convert.${target}`), 'file-plus-2', () => convert(target), { dataset: { convert: target } })),
      ...manual.map(s => btn(t(`documents.status.set.${s}`), 'check', () => status(s), { dataset: { setStatus: s } }))
    ].filter(Boolean);
    return [
      btn(t('documents.action.pdf'), 'download', () => downloadPdf(doc, { company, documents }), { id: 'detail-pdf' }),
      btn(t('documents.action.send'), 'mail', () => emit('document:send', { documentId: doc.id }), { id: 'detail-send' }),
      isPayable(doc.kind) && row.status !== 'CANCELLED' ? btn(t('documents.action.addPayment'), 'banknote', pay, { id: 'detail-add-payment', class: 'btn btn-primary' }) : null,
      btn(t('documents.action.edit'), 'pencil-line', edit, { id: 'detail-edit' }),
      h('details', { class: 'more-actions' }, h('summary', { class: 'btn btn-ghost' }, icon('ellipsis'), t('documents.action.more')), h('div', { class: 'more-menu' }, more))
    ];
  }

  return { buttons, canWrite, removePayment: removePaymentWithUndo, saveReceipt };
}
