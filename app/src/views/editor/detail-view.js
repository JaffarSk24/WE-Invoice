// The card of an issued document (07-ui-ux-i18n.md § 7.3): status ribbon,
// the actions, client and amounts, payments, attachments, related
// documents, the send log and the PDF. Redrawn when the document changes (a payment, a status
// from the Peppol package). Demo documents show their summary only.
import { canEdit } from '@we-invoice/core';
import { h, icon, clear, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate, formatDateTime, todayLocal } from '../../components/dates.js';
import { documentRow } from '../documents/rows.js';
import { statusCell } from '../documents/list-columns.js';
import { salesHash, routeForKind } from '../documents/kinds.js';
import { findDocument, companyNow, contactsById, allDocuments } from '../documents/source.js';
import { pdfOptions } from '../documents/pdf-options.js';
import { canFrameBlobs } from '../documents/pdf-frame.js';
import { buildPdf } from '../../pdf/index.js';
import { ribbonSteps } from './ribbon.js';
import { paymentsCard } from './payments.js';
import { detailActions } from './detail-actions.js';
import { attachmentsPanel } from './attachments-panel.js';
import { attachmentHandlers } from './attachment-handlers.js';

function field(label, value) {
  return value ? h('div', { class: 'detail-field' }, h('span', { class: 'muted small' }, label), h('span', {}, value)) : null;
}

function ribbon(doc, status) {
  return h('ol', { class: 'status-ribbon', 'aria-label': t('documents.detail.progress') },
    ribbonSteps(doc, status).map(step => h('li', { class: step.done ? 'is-done' : null, 'aria-current': null },
      icon(step.done ? 'circle-check' : 'circle'), h('span', {}, t(`documents.ribbon.${step.id}`)))));
}

function summary(doc, row) {
  const b = doc.buyer || {};
  const a = b.address || {};
  const currency = row.currency;
  return h('section', { class: 'card detail-summary' },
    h('div', { class: 'detail-grid' },
      field(t('documents.party.client'), [b.name || row.contactName, [a.street, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' · ')),
      field(t('documents.editor.issueDate'), formatDate(doc.issueDate)),
      field(t('documents.editor.taxDate'), formatDate(doc.taxDate)),
      field(t('documents.editor.dueDate'), formatDate(doc.dueDate)),
      field(t('documents.editor.validUntil'), formatDate(doc.validUntil)),
      field(t('documents.editor.vs'), doc.vs),
      field(t('documents.editor.paymentMethod'), doc.paymentMethod ? t(`documents.payment.method.${doc.paymentMethod}`) : null),
      field(t('documents.editor.correctionReason'), doc.correctionReason)),
    h('div', { class: 'detail-amounts' },
      field(t('documents.totals.net'), formatAmount(row.net, currency)),
      field(t('documents.totals.vat'), formatAmount(row.vat, currency)),
      field(t('documents.totals.payable'), formatAmount(row.payable, currency)),
      field(t('documents.col.due'), formatAmount(row.due, currency))),
    doc.noteInternal ? h('p', { class: 'muted small detail-note' }, t('documents.detail.note', { note: doc.noteInternal })) : null);
}

function linksCard(doc, documents) {
  const outgoing = (doc.links || []).map(l => ({ link: l, other: documents.find(d => d.id === l.docId) }));
  const incoming = documents.filter(d => d.id !== doc.id && (d.links || []).some(l => l.docId === doc.id)).map(d => ({ link: (d.links || []).find(l => l.docId === doc.id), other: d }));
  const items = [...outgoing, ...incoming].filter(x => x.other);
  if (!items.length) return null;
  return h('section', { class: 'card detail-links', 'aria-labelledby': 'detail-links-title' },
    h('h2', { id: 'detail-links-title' }, t('documents.detail.links')),
    h('ul', {}, items.map(({ link, other }) => h('li', {},
      h('a', { href: salesHash(routeForKind(other.kind) || 'invoices', { id: other.id }) }, `${t(`document.kind.${other.kind}`)} ${other.number || t('documents.list.noNumber')}`),
      h('span', { class: 'muted small' }, ` · ${t(`documents.link.${link.kind}`)}${link.amount ? ` · ${formatAmount(link.amount, other.currency || 'EUR')}` : ''}`)))));
}

function sendLogCard(doc) {
  const log = doc.sendLog || [];
  if (!log.length) return null;
  return h('section', { class: 'card detail-sendlog', 'aria-labelledby': 'detail-sendlog-title' },
    h('h2', { id: 'detail-sendlog-title' }, t('documents.detail.sendLog')),
    h('ul', {}, log.map(e => h('li', {}, `${formatDateTime(e.at)} · ${e.channel}${e.to ? ` · ${e.to}` : ''} · ${e.result}`))));
}

function pdfCard(doc, company, onUrl) {
  if (!canFrameBlobs()) return null;
  const frame = h('iframe', { class: 'pdf-frame', title: t('documents.preview.title') });
  const status = h('p', { class: 'muted small' }, t('documents.preview.loading'));
  buildPdf(doc, company, { ...pdfOptions(doc, company, allDocuments()), allowIncomplete: true })
    .then(blob => { const url = URL.createObjectURL(blob); onUrl(url); frame.src = url; status.hidden = true; })
    .catch(e => { console.error('PDF of the document failed', e); status.textContent = t('documents.preview.failed'); });
  return h('section', { class: 'card detail-pdf' }, status, frame);
}

let unsubscribe = [];

export function renderDetail(root, { route, id }) {
  unsubscribe.forEach(off => off());
  unsubscribe = [];
  const body = h('div', { class: 'detail' });
  root.append(body);
  let pdfUrl = null;
  const keepUrl = (url) => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); pdfUrl = url; };

  const draw = () => {
    clear(body);
    const doc = findDocument(id);
    if (!doc) {
      body.append(h('p', { class: 'muted' }, t('documents.detail.notFound')), h('a', { href: salesHash(route), class: 'btn' }, icon('arrow-left'), t('documents.editor.back')));
      return;
    }
    const company = companyNow();
    const row = documentRow(doc, { contacts: contactsById(), company, today: todayLocal() });
    const documents = allDocuments();
    const full = Array.isArray(doc.lines);
    const actions = full ? detailActions({ doc, row, company, route, documents, redraw: draw }) : null;
    append(body, [
      h('header', { class: 'view-header editor-header' },
        h('div', { class: 'editor-title' },
          h('a', { href: salesHash(route), class: 'btn btn-ghost btn-icon', 'aria-label': t('documents.editor.back') }, icon('arrow-left')),
          h('h1', {}, `${t(`document.kind.${doc.kind}`)} ${doc.number || ''}`.trim()), statusCell(row)),
        actions ? h('div', { class: 'view-actions detail-actions' }, actions.buttons()) : null),
      ribbon(doc, row.status),
      summary(doc, row),
      full && actions ? paymentsCard({ doc, company, readOnly: !actions.canWrite(), onRemove: actions.removePayment, onReceipt: actions.saveReceipt }) : null,
      full && actions ? attachmentsPanel({ doc, readOnly: !actions.canWrite(), ...attachmentHandlers({ prepare: () => doc.id }) }) : null,
      linksCard(doc, documents),
      sendLogCard(doc),
      full ? pdfCard(doc, company, keepUrl) : null]);
    if (full && !canEdit(doc).editable && canEdit(doc).reason === 'DOCUMENT_PEPPOL_SENT') body.append(h('p', { class: 'muted small' }, t('errors.DOCUMENT_PEPPOL_SENT')));
    refreshIcons(body);
  };
  draw();
  const redraw = (e) => { if (!body.isConnected) return; if (e && e.collection && e.collection !== 'documents' && e.collection !== 'company') return; draw(); };
  unsubscribe.push(on('data:changed', redraw));
  ['peppol:status', 'demo:enabled', 'demo:disabled', 'company:switched'].forEach(ev => unsubscribe.push(on(ev, () => redraw())));
}
