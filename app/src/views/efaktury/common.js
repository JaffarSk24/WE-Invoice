// Pieces shared by the e-invoice screens: the status badge of a Peppol
// state (coloured like the document status it resembles, text from
// peppol.status.*), the messages of a document's errors and the detail
// dialog of one e-invoice.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { statusBadge } from '../../components/status-badge.js';
import { openModal } from '../../ui/modal.js';
import { formatDateTime } from '../../components/dates.js';

// Peppol state -> document status whose colour and icon it borrows.
const TONE = Object.freeze({
  DRAFT: 'DRAFT', NOT_SENT: 'ISSUED', VALIDATING: 'ISSUED', READY: 'ISSUED', SENDING: 'SENT', ACCEPTED: 'SENT',
  DELIVERED: 'DELIVERED', INVALID: 'OVERDUE', FAILED: 'OVERDUE', REJECTED: 'REJECTED', RECEIVED: 'TO_PROCESS'
});

export function peppolBadge(status) {
  const el = statusBadge(TONE[status] || 'DRAFT', { label: t(`peppol.status.${status}`) });
  el.dataset.peppolStatus = status;
  return el;
}

/** Readable text of one stored error: a rule, a provider answer or an app error. */
export function errorText(error) {
  const issueKey = `peppol.issue.${error.code}`;
  const issue = t(issueKey, { detail: error.message || '' });
  if (issue !== issueKey) return issue;
  const appKey = `errors.${error.code}`;
  const app = t(appKey);
  if (app !== appKey) return error.message && error.code === 'PEPPOL_VALIDATION' ? `${app} ${error.message}` : app;
  return error.message || error.code;
}

function row(label, value) {
  return value ? h('div', { class: 'peppol-detail-row' }, h('dt', {}, label), h('dd', {}, value)) : null;
}

/** Dialog with the state of one e-invoice and what to fix. */
export function openPeppolDetail(document, { actions = [] } = {}) {
  const p = document.peppol || {};
  const errors = p.errors || [];
  const body = h('div', { class: 'peppol-detail' },
    h('div', {}, peppolBadge(p.status || 'NOT_SENT')),
    h('dl', {},
      row(t('peppol.detail.provider'), p.providerId),
      row(t('peppol.detail.messageId'), p.providerMessageId),
      row(t('peppol.detail.sentAt'), p.sentAt ? formatDateTime(p.sentAt) : null),
      row(t('peppol.detail.deliveredAt'), p.deliveredAt ? formatDateTime(p.deliveredAt) : null)),
    errors.length ? h('div', { class: 'callout callout-warning' },
      h('strong', {}, t('peppol.detail.errors')),
      h('ul', {}, errors.map(e => h('li', {}, errorText(e))))) : null,
    p.status === 'REJECTED' ? h('p', { class: 'callout callout-danger' }, t('peppol.out.rejectedHint')) : null,
    p.direction === 'OUT' && document.lockedAt ? h('p', { class: 'muted small' }, t('peppol.out.locked')) : null);
  return openModal({
    title: t('peppol.detail.title', { number: document.number || '' }),
    body,
    actions: [...actions, { label: t('peppol.detail.close'), onClick: (m) => m.close() }]
  });
}
