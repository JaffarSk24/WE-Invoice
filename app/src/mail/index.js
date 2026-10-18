// The e-mail module (03-features.md § 3.8). Any screen asks for the e-mail
// window of a document with the event
//   document:send { documentId, purpose?, penalties? }
// and the module finds the document, its contact and the templates and
// opens the window. Automatic sending (recurring invoices, reminders)
// uses sendAutomatically(), which only works with an SMTP account.
import { t } from '../i18n/index.js';
import { showToast, showError } from '../ui/toast.js';
import { todayLocal } from '../components/dates.js';
import { getOf, listOf, companyOf, openStore } from '../views/contacts/source.js';
import { isDemo } from '../views/shell/demo-mode.js';
import { composeMail } from './compose.js';
import { smtpAccount } from './deliver.js';
import { sendDocumentMail } from './send.js';

export { composeMail, mailtoUrl } from './compose.js';
export { smtpAccount } from './deliver.js';

export function canSendAutomatically(win) {
  return Boolean(smtpAccount(win));
}

function contactOf(document) {
  return document.contactId ? getOf('contacts', document.contactId) : null;
}

export async function openDocumentMail({ documentId, purpose = 'SEND', penalties = '' }, { transport }) {
  const document = getOf('documents', documentId);
  if (!document) { showToast(t('mail.error.noDocument'), { type: 'error' }); return null; }
  if (document.status === 'DRAFT') { showToast(t('mail.error.draft'), { type: 'error' }); return null; }
  const { openSendDialog } = await import('./dialog.js');
  return openSendDialog({
    document, company: companyOf(), contact: contactOf(document), templates: listOf('emailTemplates'),
    store: isDemo() ? null : openStore(), transport, purpose, penalties, readOnly: isDemo()
  });
}

/**
 * Sends without a window (SMTP only). Resolves to the log entry, or null
 * when the document has no recipient or no SMTP account is set up.
 */
export async function sendAutomatically({ store, document, purpose = 'SEND', penalties = '', transport, win, pdf }) {
  if (!smtpAccount(win)) return null;
  const company = store.company();
  const contact = document.contactId ? store.get('contacts', document.contactId) : null;
  const message = composeMail({ document, company, contact, templates: store.list('emailTemplates'), purpose, today: todayLocal(), penalties });
  if (!message.to.length) return null;
  const { entry } = await sendDocumentMail({ store, document, company, message, transport, win, allowClient: false, attach: true, pdf });
  return entry;
}

export function initMail(ctx) {
  const { transport } = ctx;
  return ctx.on('document:send', (payload) => {
    if (!payload || !payload.documentId) return;
    openDocumentMail(payload, { transport }).catch(e => showError(e, 'errors.MAIL_FAILED'));
  });
}
