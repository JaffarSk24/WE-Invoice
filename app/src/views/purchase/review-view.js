// The review of one received document: the file on the left, the form on
// the right. A document from the Inbox is confirmed here ("Potvrdiť a
// uložiť"); a processed one is edited, paid or deleted; "new" types one
// in by hand. Recognised values the core was unsure of are marked.
import { amountDue, cmp } from '@we-invoice/core';
import { h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { navigate } from '../../router.js';
import { statusBadge } from '../../components/status-badge.js';
import { emptyState } from '../../components/empty-state.js';
import { todayLocal, formatDate } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { isDemo } from '../shell/demo-mode.js';
import { storeOrNull, canWrite, receivedStatus } from './data.js';
import { createReviewForm } from './review-form.js';
import { createPreview } from './preview.js';
import { validateValues } from './review-values.js';
import { blankDocument, saveDocument, recordPayment, deleteDocument, pickedValue } from './review-actions.js';
import { openPaymentDialog } from './payment-dialog.js';
import { confidenceChip } from './columns.js';

const listOf = (kind) => (kind === 'EXPENSE_RECEIPT' ? 'expenses' : 'received');
const pastDue = (doc, today) => Boolean(doc.dueDate && doc.dueDate < today && doc.totals && cmp(amountDue(doc), '0') > 0);

function paymentInfo(doc) {
  if (!doc.totals || doc.status === 'TO_PROCESS') return null;
  const due = amountDue(doc);
  if (cmp(due, '0') <= 0) return null;
  const rows = [
    [t('purchase.payment.due'), formatAmount(due, doc.currency || 'EUR')],
    doc.payee && doc.payee.iban ? [t('purchase.field.iban'), doc.payee.iban] : null,
    doc.vs ? [t('purchase.field.vs'), doc.vs] : null
  ].filter(Boolean);
  return h('dl', { class: 'payment-info card' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

export function renderReview(root, { id, route, ctx, newKind = null }) {
  const store = storeOrNull();
  const today = todayLocal();
  const isNew = id === 'new';
  if (isNew && (isDemo() || !canWrite(store))) {
    showToast(t(isDemo() ? 'purchase.demo.readOnly' : 'purchase.noCompany'), { type: 'info' });
    navigate(route);
    return;
  }
  const doc = isNew ? blankDocument(newKind, { company: store.company(), today }) : (store && store.company() ? store.get('documents', id) : null);
  if (!doc) {
    root.append(emptyState({ title: t('purchase.review.missing'), iconName: 'file-minus', actionLabel: t('purchase.review.back'), onAction: () => navigate(route), actionIcon: 'arrow-left' }));
    return;
  }
  const writable = canWrite(store);
  const regions = {};
  let preview = null;
  const vatPayer = store.company().vatMode === 'PAYER';
  const form = createReviewForm(doc, { vatPayer, pickEnabled: !isNew, onPick: (field) => { if (!preview.startPick(field)) showToast(t('purchase.preview.noText'), { type: 'info' }); } });
  if (!isNew) {
    preview = createPreview(doc, {
      onPicked: (field, text, region) => {
        const value = pickedValue(field, text);
        if (value === null) { showToast(t('purchase.review.pickInvalid', { text }), { type: 'error' }); return; }
        form.setValue(field, value);
        regions[field] = region;
      }
    });
  }

  async function save() {
    if (!writable) { showToast(t('purchase.demo.readOnly'), { type: 'info' }); return; }
    const values = form.values();
    if (form.showErrors(validateValues(values))) return;
    try {
      const saved = await saveDocument(store, doc, values, { regions, isNew, today });
      showToast(t(inbox ? 'purchase.review.confirmed' : 'purchase.review.saved'), { type: 'success' });
      const next = inbox || isNew ? listOf(saved.kind) : `${route}/${saved.id}`;
      if ((inbox || isNew) && pastDue(saved, today)) askPaid(saved, next);
      else navigate(next);
    } catch (e) {
      showError(e, 'errors.PURCHASE_SAVE_FAILED');
    }
  }

  async function remove() {
    if (!writable) { showToast(t('purchase.demo.readOnly'), { type: 'info' }); return; }
    if (!(await confirmDialog(t('purchase.review.deleteConfirm'), { danger: true, okLabel: t('common.delete') }))) return;
    try {
      await deleteDocument(store, doc);
      showToast(t('purchase.review.deleted'), { type: 'success' });
      navigate(route);
    } catch (e) {
      showError(e, 'errors.PURCHASE_SAVE_FAILED');
    }
  }

  // Confirmed after its due date: most likely an old bill, paid already.
  function askPaid(saved, next) {
    openPaymentDialog(saved, {
      today,
      date: saved.dueDate,
      lead: t('purchase.payment.pastDue', { date: formatDate(saved.dueDate) }),
      cancelLabel: t('purchase.payment.notYet'),
      onClose: () => navigate(next),
      onSave: async (payment) => {
        try {
          await recordPayment(store, saved, payment, today);
          showToast(t('purchase.payment.saved'), { type: 'success' });
          return true;
        } catch (e) {
          showError(e, 'errors.PURCHASE_SAVE_FAILED');
          return false;
        }
      }
    });
  }

  function pay() {
    openPaymentDialog(doc, {
      today,
      onSave: async (payment) => {
        try {
          await recordPayment(store, doc, payment, today);
          showToast(t('purchase.payment.saved'), { type: 'success' });
          navigate(`${route}/${doc.id}`);
          return true;
        } catch (e) {
          showError(e, 'errors.PURCHASE_SAVE_FAILED');
          return false;
        }
      }
    });
  }

  const status = isNew ? null : receivedStatus(doc, today);
  const inbox = doc.status === 'TO_PROCESS' && !isNew;
  const title = isNew ? t('purchase.review.newTitle', { kind: t(`document.kind.${doc.kind}`) }) : `${t(`document.kind.${doc.kind}`)} ${doc.number || ''}`.trim();
  const actions = h('div', { class: 'review-actions' },
    h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'save' }, disabled: !writable, onclick: save },
      icon('check'), t(inbox ? 'purchase.review.confirm' : 'common.save')),
    !inbox && !isNew && status !== 'PAID' && status !== 'OVERPAID'
      ? h('button', { type: 'button', class: 'btn', dataset: { action: 'pay' }, disabled: !writable, onclick: pay }, icon('banknote'), t('purchase.payment.title')) : null,
    !isNew ? h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'delete' }, disabled: !writable, onclick: remove }, icon('trash-2'), t('common.delete')) : null);

  append(root, [
    h('header', { class: 'view-header' },
      h('div', { class: 'review-title' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': t('purchase.review.back'), onclick: () => navigate(route) }, icon('arrow-left')),
        h('h1', {}, title), status ? statusBadge(status) : null,
        doc.inbox ? confidenceChip(doc.inbox.confidence, doc.inbox.needsConfirmation) : null)),
    inbox && doc.inbox && doc.inbox.needsConfirmation ? h('p', { class: 'review-notice', role: 'note' }, icon('info'), t('purchase.review.notice')) : null,
    h('div', { class: `review-grid ${preview ? '' : 'no-preview'}`.trim() }, preview ? preview.el : null,
      h('div', { class: 'review-side' }, isNew ? null : paymentInfo(doc), form.el, actions))]);
  refreshIcons(root);
}
