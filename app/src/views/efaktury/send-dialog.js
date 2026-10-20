// The window before an e-invoice leaves (BT-125): Peppol BIS 3 embeds only
// PDF, PNG, JPEG, CSV, XLSX and ODS files, so the attachments of other
// types stay out. When a document has such files the user sees which ones
// and decides whether to send without them; otherwise sending goes on
// without a question.
import { splitAttachments } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal } from '../../ui/modal.js';
import { errorText } from './common.js';

/** Names of the document's attachments that will not be embedded. */
export function skippedAttachmentNames(document) {
  return splitAttachments(document?.attachments || []).skipped.map(a => a.name);
}

/**
 * Asks before sending a document whose attachments are partly left out.
 * @returns {Promise<boolean>} true to send
 */
export function confirmSend(document) {
  const names = skippedAttachmentNames(document);
  if (!names.length) return Promise.resolve(true);
  return new Promise(resolve => {
    let answered = false;
    const answer = (value, modal) => {
      if (!answered) {
        answered = true;
        resolve(value);
      }
      if (modal) modal.close();
    };
    openModal({
      title: t('peppol.send.title', { number: document.number || '' }),
      body: h('div', { class: 'peppol-send-check' },
        h('p', {}, t('peppol.send.skipped', { n: names.length })),
        h('ul', { class: 'peppol-skipped' }, names.map(name => h('li', {}, name))),
        h('p', { class: 'muted small' }, t('peppol.send.skippedHint'))),
      actions: [
        { label: t('common.cancel'), onClick: (m) => answer(false, m) },
        { label: t('peppol.send.confirm'), kind: 'primary', onClick: (m) => answer(true, m) }
      ],
      onClose: () => answer(false)
    });
  });
}

/**
 * One toast with the outcome of sending one document; a document that
 * needs fixing names its first problem (missing attachment file, message
 * too large, a rule of sk-rules.json).
 */
export function reportSendResult(document, { showToast, showError }) {
  const p = document?.peppol || {};
  const number = document?.number || '';
  if (p.status === 'ACCEPTED' || p.status === 'DELIVERED') showToast(t('peppol.out.sent', { number }), { type: 'success' });
  else if (p.status === 'FAILED' && p.nextAttemptAt) showToast(t('peppol.out.failed', { number }), { type: 'info' });
  else if (p.status === 'FAILED') showError({ code: p.errors?.[0]?.code });
  else if (p.status === 'INVALID') {
    const first = p.errors?.[0];
    showToast([t('peppol.out.invalid', { number }), first ? errorText(first) : ''].filter(Boolean).join(' '), { type: 'error', duration: 10000 });
  }
}
