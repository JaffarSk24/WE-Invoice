// The advance part of a received document's review. An invoice shows the
// paid proforma it settles (with a button to undo the link) or, while it
// is unpaid and the supplier has a paid proforma, a button to link one by
// hand; a proforma shows the invoice that settled it.
import { amountDue, cmp, advanceChoicesFor, ownPaid } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { openModal } from '../../ui/modal.js';
import { navigate } from '../../router.js';
import { selectField } from '../../components/fields.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { advancesOf, invoicesOf, linkAdvance, unlinkAdvance } from './advances.js';

const docLink = (doc, route) => h('a', { href: `#/${route}/${doc.id}`, class: 'advance-doc' }, `${t(`document.kind.${doc.kind}`)} ${doc.number || ''}`.trim());

function choiceLabel(doc) {
  return [doc.number || t('purchase.advance.noNumber'), doc.issueDate ? formatDate(doc.issueDate) : null, formatAmount(ownPaid(doc), doc.currency || 'EUR')].filter(Boolean).join(' · ');
}

function openLinkDialog(doc, choices, { store, today, route }) {
  const pick = selectField({ label: t('purchase.advance.choose'), value: choices[0].id, attrs: { id: 'advance-choice' }, options: choices.map(c => ({ value: c.id, label: choiceLabel(c) })) });
  openModal({
    title: t('purchase.advance.linkTitle'),
    body: h('div', {}, h('p', { class: 'payment-lead' }, t('purchase.advance.linkLead')), pick.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('purchase.advance.link'), kind: 'primary',
        onClick: async (m) => {
          const proforma = choices.find(c => c.id === pick.value());
          try {
            await linkAdvance(store, store.get('documents', doc.id), proforma, { today });
            m.close();
            showToast(t('purchase.advance.linked', { proforma: proforma.number || '', invoice: doc.number || '' }), { type: 'success' });
            navigate(`${route}/${doc.id}`);
          } catch (e) {
            showError(e, 'errors.PURCHASE_SAVE_FAILED');
          }
        }
      }
    ]
  });
}

function invoicePart(doc, { store, today, writable, route }) {
  const documents = store.list('documents');
  const linked = advancesOf(doc, documents);
  if (linked.length) {
    return h('div', { class: 'advance-info card', dataset: { advance: 'linked' } },
      h('p', { class: 'advance-title' }, icon('file-check'), t('purchase.advance.paidBy')),
      linked.map(({ proforma, amount, docId }) => h('div', { class: 'advance-row' },
        proforma ? docLink(proforma, route) : h('span', {}, t('purchase.advance.missing')),
        h('span', { class: 'num' }, formatAmount(amount, doc.currency || 'EUR')),
        writable ? h('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', dataset: { action: 'unlink-advance' },
          onclick: async () => {
            try {
              await unlinkAdvance(store, store.get('documents', doc.id), docId, { today });
              showToast(t('purchase.advance.unlinked'), { type: 'success' });
              navigate(`${route}/${doc.id}`);
            } catch (e) {
              showError(e, 'errors.PURCHASE_SAVE_FAILED');
            }
          }
        }, t('purchase.advance.unlink')) : null)));
  }
  if (!writable || doc.status === 'TO_PROCESS' || !doc.totals || cmp(amountDue(doc), '0') <= 0) return null;
  const choices = advanceChoicesFor(doc, documents);
  if (!choices.length) return null;
  return h('div', { class: 'advance-info card', dataset: { advance: 'offer' } },
    h('p', { class: 'muted' }, t('purchase.advance.offer')),
    h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'link-advance' }, onclick: () => openLinkDialog(doc, choices, { store, today, route }) },
      icon('file-check'), t('purchase.advance.linkButton')));
}

function proformaPart(doc, { store, route }) {
  const invoices = invoicesOf(doc, store.list('documents'));
  if (!invoices.length) return null;
  return h('div', { class: 'advance-info card', dataset: { advance: 'settled' } },
    h('p', { class: 'advance-title' }, icon('file-check'), t('purchase.advance.settledBy')),
    invoices.map(inv => h('div', { class: 'advance-row' }, docLink(inv, route))));
}

/** The advance block of a received document's review, or null. */
export function advancePanel(doc, ctx) {
  if (!ctx.store || !ctx.store.company()) return null;
  if (doc.kind === 'RECEIVED_INVOICE') return invoicePart(doc, ctx);
  if (doc.kind === 'RECEIVED_PROFORMA') return proformaPart(doc, ctx);
  return null;
}
