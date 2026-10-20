// Pieces shared by the e-invoice screens: the status badge of a Peppol
// state (coloured like the document status it resembles, text from
// peppol.status.*), the messages of a document's errors and the detail
// dialog of one e-invoice.
import { h } from '../../ui/dom.js';
import { t, currentLang } from '../../i18n/index.js';
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

const megabytes = (bytes) => new Intl.NumberFormat(currentLang(), { maximumFractionDigits: 1 }).format(Number(bytes || 0) / (1024 * 1024));

// Placeholders of an error text: the stored message as {detail}, the file
// names of attachment errors as {names} with their count {n}, and the sizes
// of a message over the limit in MB.
function errorParams(error) {
  const params = { detail: error.message || '' };
  const names = error.params?.names || (error.code === 'ATTACHMENT_MISSING' ? String(error.message || '').split(', ').filter(Boolean) : null);
  if (names) Object.assign(params, { names: names.join(', '), n: names.length });
  if (error.params?.bytes) Object.assign(params, { size: megabytes(error.params.bytes), limit: megabytes(error.params.limit) });
  return params;
}

/** Readable text of one stored error: a rule, a provider answer or an app error. */
export function errorText(error) {
  const issueKey = `peppol.issue.${error.code}`;
  const issue = t(issueKey, errorParams(error));
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
    p.skippedAttachments?.length ? h('div', { class: 'callout' },
      h('strong', {}, t('peppol.detail.skipped')),
      h('ul', {}, p.skippedAttachments.map(name => h('li', {}, name)))) : null,
    p.status === 'REJECTED' ? h('p', { class: 'callout callout-danger' }, t('peppol.out.rejectedHint')) : null,
    p.direction === 'OUT' && document.lockedAt ? h('p', { class: 'muted small' }, t('peppol.out.locked')) : null);
  return openModal({
    title: t('peppol.detail.title', { number: document.number || '' }),
    body,
    actions: [...actions, { label: t('peppol.detail.close'), onClick: (m) => m.close() }]
  });
}
