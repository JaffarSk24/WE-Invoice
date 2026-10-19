// The e-mail module (03-features.md § 3.8). Any screen asks for the e-mail
// window of a document with the event
//   document:send { documentId, purpose?, penalties? }
// (wired in boot/sales-crm.js) and the module finds the document, its
// contact and the templates and opens the window. Automatic sending (recurring invoices, reminders)
// uses sendAutomatically(), which only works with an SMTP account.
import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { todayLocal } from '../components/dates.js';
import { getOf, listOf, companyOf, openStore } from '../views/contacts/source.js';
import { isDemo } from '../views/shell/demo-mode.js';
import { composeMail } from './compose.js';
import { smtpAccount } from './deliver.js';
import { sendDocumentMail } from './send.js';

export { composeMail, mailtoUrl } from './compose.js';
export { smtpAccount } from './deliver.js';

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
 * copyToSelf adds the company address as a blind copy (recurring invoices).
 */
export async function sendAutomatically({ store, document, purpose = 'SEND', penalties = '', transport, win, pdf, copyToSelf = false }) {
  if (!smtpAccount(win)) return null;
  const company = store.company();
  const contact = document.contactId ? store.get('contacts', document.contactId) : null;
  const composed = composeMail({ document, company, contact, templates: store.list('emailTemplates'), purpose, today: todayLocal(), penalties });
  const self = copyToSelf && company && company.email && !composed.bcc.includes(company.email) ? [company.email] : [];
  const message = { ...composed, bcc: [...composed.bcc, ...self] };
  if (!message.to.length) return null;
  const { entry } = await sendDocumentMail({ store, document, company, message, transport, win, allowClient: false, attach: true, pdf });
  return entry;
}
